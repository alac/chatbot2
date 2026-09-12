import { settings } from '../state/AppSettings.js';
import { TextRenderer } from './TextRenderer.js';

export class DraftSwitcher {
    constructor(app) {
        this.app = app;
        this.currentAddDraftsMsgIndex = -1;
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-close-add-drafts').addEventListener('click', () => {
            document.getElementById('add-drafts-modal').classList.add('hidden');
        });
        
        document.getElementById('add-drafts-count').addEventListener('change', (e) => {
            const count = parseInt(e.target.value);
            for (let i = 0; i < 3; i++) {
                const sel = document.getElementById(`add-drafts-model-${i}`);
                if (i < count) sel.classList.remove('hidden');
                else sel.classList.add('hidden');
            }
        });

        document.getElementById('btn-generate-add-drafts').addEventListener('click', () => {
            this.executeAdditionalDrafts();
        });
    }

    buildSwitcherDOM(index, msg, isStreaming) {
        const switcher = document.createElement('div');
        switcher.className = `draft-switcher top`;
        switcher.id = `switcher-${index}`;
        
        const controlsRow = document.createElement('div');
        controlsRow.className = 'switcher-controls';

        const btnPrev = document.createElement('button');
        btnPrev.textContent = '◀';
        btnPrev.onclick = () => this.switchDraft(index, -1);
        
        const select = document.createElement('select');
        select.id = `draft-select-${index}`;
        
        const activeBatchStartIdx = msg.drafts.length - (this.app.activeBatch ? this.app.activeBatch.jobs.length : 0);

        msg.drafts.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            let modelStr = d.model;
            
            if (isStreaming && !d.isStale && this.app.activeBatch && i >= activeBatchStartIdx) {
                const job = this.app.activeBatch.jobs[i - activeBatchStartIdx];
                if (job) modelStr = job.model;
            }

            const staleMarker = d.isStale ? ' (Old)' : '';
            opt.textContent = `V${i+1} | ${modelStr ? modelStr.split('/').pop() : 'Unknown'}${staleMarker}`;
            if (i === msg.activeDraftIndex) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e) => this.switchDraftExplicit(index, parseInt(e.target.value));

        const btnNext = document.createElement('button');
        btnNext.textContent = '▶';
        btnNext.onclick = () => this.switchDraft(index, 1);

        const btnAdd = document.createElement('button');
        btnAdd.textContent = '+';
        btnAdd.title = 'Generate additional drafts';
        btnAdd.onclick = () => this.openAddDraftsModal(index);

        const btnMerge = document.createElement('button');
        btnMerge.innerHTML = '🔀';
        btnMerge.title = 'Merge Drafts';
        btnMerge.onclick = () => this.app.draftMergeManager.open(index);

        controlsRow.appendChild(btnPrev);
        controlsRow.appendChild(select);
        controlsRow.appendChild(btnNext);
        controlsRow.appendChild(btnAdd);
        controlsRow.appendChild(btnMerge);

        const statusRow = document.createElement('div');
        statusRow.className = 'switcher-status';
        
        msg.drafts.forEach((d, i) => {
            const spanGroup = document.createElement('span');
            
            const icon = document.createElement('span');
            icon.id = `draft-icon-${index}-${i}`;
            icon.textContent = d.status === 'done' ? '✔️' : (d.status === 'error' ? '❌' : '🕒');
            if (i === msg.activeDraftIndex) icon.classList.add('active-icon');
            
            const timer = document.createElement('span');
            timer.id = `batch-timer-${index}-${i}`;
            timer.style.marginLeft = '2px';
            
            if (d.isStale) {
                timer.textContent = '[X]';
            } else if (isStreaming && d.status === 'streaming') {
                const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
                const totalChars = (d.content?.length || 0) + (d.reasoning?.length || 0);
                timer.textContent = `(~${Math.ceil(totalChars / charsRatio)}t)`;
            } else {
                timer.textContent = `(${d.duration}s)`;
            }

            spanGroup.appendChild(icon);
            spanGroup.appendChild(timer);
            statusRow.appendChild(spanGroup);
        });

        switcher.appendChild(controlsRow);
        switcher.appendChild(statusRow);
        return switcher;
    }

    switchDraft(msgIndex, dir) {
        const msg = this.app.state.history[msgIndex];
        const len = msg.drafts.length;
        const newIdx = (msg.activeDraftIndex + dir + len) % len;
        this.switchDraftExplicit(msgIndex, newIdx);
    }

    switchDraftExplicit(msgIndex, draftIdx) {
        this.app.state.setActiveDraft(msgIndex, draftIdx);
        
        const contentNode = document.getElementById(`content-${msgIndex}`);
        const reasonNode = document.getElementById(`reasoning-${msgIndex}`);
        const reasonDiv = document.getElementById(`reasoning-block-${msgIndex}`);
        
        const msg = this.app.state.history[msgIndex];
        const activeDraft = msg.drafts[draftIdx];

        if (contentNode) {
            const isHighlight = msgIndex >= this.app.state.history.length - settings.highlightTurnCount;
            TextRenderer.setNodeContent(contentNode, activeDraft.content, activeDraft, isHighlight);
        }
        if (reasonNode) reasonNode.textContent = activeDraft.reasoning;
        
        if (reasonDiv) {
            if (activeDraft.reasoning) reasonDiv.classList.remove('hidden');
            else reasonDiv.classList.add('hidden');
        }

        const metaSpan = document.getElementById(`meta-span-${msgIndex}`);
        if (metaSpan) {
            const shortModel = activeDraft.model ? activeDraft.model.split('/').pop() : 'Unknown';
            metaSpan.textContent = `${shortModel} • ${activeDraft.isStale ? '[X]' : activeDraft.duration + 's'}`;
        }
        
        const btnMd = document.getElementById(`btn-md-${msgIndex}`);
        if (btnMd) {
            if (TextRenderer.shouldUseMarkdown(activeDraft.content, activeDraft.markdownOverride)) {
                btnMd.classList.add('active');
            } else {
                btnMd.classList.remove('active');
            }
        }
        
        const btnUsage = document.getElementById(`btn-usage-${msgIndex}`);
        if (btnUsage) {
            if (activeDraft.usage) btnUsage.classList.remove('hidden');
            else btnUsage.classList.add('hidden');
        }

        const select = document.getElementById(`draft-select-${msgIndex}`);
        if (select) select.value = draftIdx;

        msg.drafts.forEach((_, i) => {
            const icon = document.getElementById(`draft-icon-${msgIndex}-${i}`);
            if (icon) {
                if (i === draftIdx) icon.classList.add('active-icon');
                else icon.classList.remove('active-icon');
            }
        });
        
        const topSwitcher = document.getElementById(`switcher-${msgIndex}`);
        if (topSwitcher) {
            topSwitcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    openAddDraftsModal(msgIndex) {
        this.currentAddDraftsMsgIndex = msgIndex;
        
        // Populate dropdown options cleanly from the existing AppSettings main dropdown
        const mainDropdown = document.getElementById('select-model');
        for (let i = 0; i < 3; i++) {
            const sel = document.getElementById(`add-drafts-model-${i}`);
            sel.innerHTML = mainDropdown.innerHTML;
            sel.value = mainDropdown.value;
        }
        
        document.getElementById('add-drafts-count').value = "1";
        document.getElementById('add-drafts-count').dispatchEvent(new Event('change'));

        this.renderRecentConfigs();
        document.getElementById('add-drafts-modal').classList.remove('hidden');
    }

    renderRecentConfigs() {
        const container = document.getElementById('add-drafts-recent');
        container.innerHTML = '';
        
        if (settings.recentAdditionalDrafts.length === 0) {
            container.innerHTML = '<span style="font-size:0.85em; opacity:0.6;">No recents yet.</span>';
            return;
        }

        settings.recentAdditionalDrafts.forEach(config => {
            const btn = document.createElement('button');
            btn.className = 'recent-config-btn';
            
            // Format labels cleanly without the provider prefix
            const label = config.map(m => m.includes('/') ? m.split('/').pop() : m).join(', ');
            btn.textContent = label;
            
            btn.addEventListener('click', () => {
                document.getElementById('add-drafts-count').value = config.length.toString();
                document.getElementById('add-drafts-count').dispatchEvent(new Event('change'));
                
                config.forEach((m, i) => {
                    if (i < 3) document.getElementById(`add-drafts-model-${i}`).value = m;
                });
            });
            container.appendChild(btn);
        });
    }

    executeAdditionalDrafts() {
        if (this.currentAddDraftsMsgIndex === -1) return;
        
        const count = parseInt(document.getElementById('add-drafts-count').value);
        const models = [];
        for (let i = 0; i < count; i++) {
            models.push(document.getElementById(`add-drafts-model-${i}`).value);
        }
        
        // Save to recents (ensure uniqueness)
        const configStr = JSON.stringify(models);
        settings.recentAdditionalDrafts = settings.recentAdditionalDrafts.filter(c => JSON.stringify(c) !== configStr);
        settings.recentAdditionalDrafts.unshift(models);
        if (settings.recentAdditionalDrafts.length > 5) settings.recentAdditionalDrafts.pop();
        settings.save();

        document.getElementById('add-drafts-modal').classList.add('hidden');
        this.app.generateAdditionalDrafts(this.currentAddDraftsMsgIndex, models);
        this.currentAddDraftsMsgIndex = -1;
    }
}