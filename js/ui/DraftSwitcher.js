import { settings } from '../state/AppSettings.js';
import { TextRenderer } from './TextRenderer.js';

export class DraftSwitcher {
    constructor(app) {
        this.app = app;
        this.currentAddDraftsMsgIndex = -1;
        this.activeMsgIndex = -1;
        this.scrollOffsets = new Map(); // Tracks relative scroll offset: "msgIndex-draftIndex" -> number
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

    hide() {
        const toolbar = document.getElementById('sticky-draft-toolbar');
        toolbar.classList.add('hidden');
        toolbar.innerHTML = '';
        this.activeMsgIndex = -1;
    }

    clearOffsets() {
        this.scrollOffsets.clear();
    }

    renderSwitcher(index, isStreaming = false) {
        const toolbar = document.getElementById('sticky-draft-toolbar');
        const msg = this.app.state.history[index];
        
        if (!msg || msg.role !== 'assistant' || msg.isHidden) {
            this.hide();
            return;
        }

        this.activeMsgIndex = index;
        toolbar.classList.remove('hidden');
        toolbar.innerHTML = '';

        const draftSwitcherContent = document.createElement('div');
        draftSwitcherContent.className = 'draft-switcher';

        // 1. Controls Row
        const controlsRow = document.createElement('div');
        controlsRow.className = 'switcher-controls';

        // Prev Draft
        const btnPrevDraft = document.createElement('button');
        btnPrevDraft.textContent = '◀';
        btnPrevDraft.onclick = () => this.switchDraft(index, -1);
        if (msg.drafts.length <= 1) btnPrevDraft.disabled = true;

        // Draft Selector
        const select = document.createElement('select');
        select.id = `tb-draft-select`;
        
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
            opt.textContent = `V${i+1}/${msg.drafts.length} | ${modelStr ? modelStr.split('/').pop() : 'Unknown'}${staleMarker}`;
            if (i === msg.activeDraftIndex) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e) => this.switchDraftExplicit(index, parseInt(e.target.value));

        // Next Draft
        const btnNextDraft = document.createElement('button');
        btnNextDraft.textContent = '▶';
        btnNextDraft.onclick = () => this.switchDraft(index, 1);
        if (msg.drafts.length <= 1) btnNextDraft.disabled = true;

        // Add Drafts
        const btnAdd = document.createElement('button');
        btnAdd.textContent = '+';
        btnAdd.title = 'Generate additional drafts';
        btnAdd.onclick = () => this.openAddDraftsModal(index);

        // -- Navigation Controls --
        const btnTop = document.createElement('button');
        btnTop.innerHTML = '⤒';
        btnTop.title = 'Jump to top of this message';
        btnTop.onclick = () => this.scrollToTop(index);

        const btnPrevMsg = document.createElement('button');
        btnPrevMsg.innerHTML = '⬆️';
        btnPrevMsg.title = 'Previous Assistant Message';
        btnPrevMsg.onclick = () => this.navigateMsg(index, -1);

        const btnNextMsg = document.createElement('button');
        btnNextMsg.innerHTML = '⬇️';
        btnNextMsg.title = 'Next Assistant Message';
        btnNextMsg.onclick = () => this.navigateMsg(index, 1);

        // Merge Tool
        const btnMerge = document.createElement('button');
        btnMerge.innerHTML = '🔀';
        btnMerge.title = 'Merge Drafts';
        btnMerge.onclick = () => this.app.draftMergeManager.open(index);

        controlsRow.appendChild(btnPrevDraft);
        controlsRow.appendChild(select);
        controlsRow.appendChild(btnNextDraft);
        controlsRow.appendChild(btnAdd);
        controlsRow.appendChild(btnTop);
        controlsRow.appendChild(btnPrevMsg);
        controlsRow.appendChild(btnNextMsg);
        controlsRow.appendChild(btnMerge);

        // 2. Status Row
        const statusRow = document.createElement('div');
        statusRow.className = 'switcher-status';
        
        msg.drafts.forEach((d, i) => {
            const spanGroup = document.createElement('span');
            spanGroup.style.display = (msg.drafts.length > 1) ? 'inline-block' : 'none'; // Only show multiple ticks if parallel
            if (msg.drafts.length === 1) spanGroup.style.display = 'inline-block'; // But always show it for single draft tracking
            
            const icon = document.createElement('span');
            icon.id = `tb-draft-icon-${i}`;
            icon.textContent = d.status === 'done' ? '✔️' : (d.status === 'error' ? '❌' : '🕒');
            if (i === msg.activeDraftIndex) icon.classList.add('active-icon');
            
            const timer = document.createElement('span');
            timer.id = `tb-timer-${i}`;
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

        draftSwitcherContent.appendChild(controlsRow);
        draftSwitcherContent.appendChild(statusRow);
        toolbar.appendChild(draftSwitcherContent);
    }

    scrollToTop(msgIndex) {
        const turnWrapper = document.getElementById(`turn-wrapper-${msgIndex}`);
        const container = document.getElementById('output-container');
        if (turnWrapper && container) {
            container.scrollTop = turnWrapper.offsetTop - 10;
        }
    }

    navigateMsg(currentIndex, direction) {
        let targetIndex = -1;
        const history = this.app.state.history;
        
        if (direction === -1) {
            for (let i = currentIndex - 1; i >= 0; i--) {
                if (history[i].role === 'assistant' && !history[i].isHidden) { targetIndex = i; break; }
            }
        } else {
            for (let i = currentIndex + 1; i < history.length; i++) {
                if (history[i].role === 'assistant' && !history[i].isHidden) { targetIndex = i; break; }
            }
        }

        if (targetIndex !== -1) {
            this.renderSwitcher(targetIndex);
            this.scrollToTop(targetIndex);
        }
    }

    switchDraft(msgIndex, dir) {
        const msg = this.app.state.history[msgIndex];
        const len = msg.drafts.length;
        if (len <= 1) return;
        const newIdx = (msg.activeDraftIndex + dir + len) % len;
        this.switchDraftExplicit(msgIndex, newIdx);
    }

    switchDraftExplicit(msgIndex, draftIdx) {
        const turnWrapper = document.getElementById(`turn-wrapper-${msgIndex}`);
        const container = document.getElementById('output-container');
        const msg = this.app.state.history[msgIndex];
        const prevActiveIdx = msg.activeDraftIndex;
        
        // 1. Record exact scroll offset before applying changes
        if (turnWrapper && container) {
            const currentOffset = container.scrollTop - turnWrapper.offsetTop;
            this.scrollOffsets.set(`${msgIndex}-${prevActiveIdx}`, currentOffset);
        }

        // 2. Perform Data Switch
        this.app.state.setActiveDraft(msgIndex, draftIdx);
        
        const contentNode = document.getElementById(`content-${msgIndex}`);
        const reasonNode = document.getElementById(`reasoning-${msgIndex}`);
        const reasonDiv = document.getElementById(`reasoning-block-${msgIndex}`);
        
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

        // 3. Update Toolbar UI
        const select = document.getElementById(`tb-draft-select`);
        if (select) select.value = draftIdx;

        msg.drafts.forEach((_, i) => {
            const icon = document.getElementById(`tb-draft-icon-${i}`);
            if (icon) {
                if (i === draftIdx) icon.classList.add('active-icon');
                else icon.classList.remove('active-icon');
            }
        });

        // 4. Restore scroll offset exactly
        if (turnWrapper && container) {
            const targetOffset = this.scrollOffsets.get(`${msgIndex}-${draftIdx}`) || 0;
            container.scrollTop = turnWrapper.offsetTop + targetOffset;
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
