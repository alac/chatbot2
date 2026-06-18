// BEGIN FILE: js/ui/ApplyEditsManager.js
import { settings } from '../state/AppSettings.js';
import { diffWords } from '../utils/diff.js';

export class ApplyEditsManager {
    constructor(app) {
        this.app = app; // Reference to the main UIManager/App
        this.extractedEdits = [];
        this.currentEditEditing = null;
        this.aeSettings = {
            groupEdits: true,
            collapseReasoning: true,
            hideInvalid: false,
            contextChars: 10
        };

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-open-apply-edits').addEventListener('click', () => this.openApplyEdits());
        document.getElementById('btn-close-ae').addEventListener('click', () => document.getElementById('apply-edits-modal').classList.add('hidden'));
        document.getElementById('ae-filter-draft').addEventListener('change', () => this.renderApplyEditsList());
        document.getElementById('btn-ae-top').addEventListener('click', () => document.getElementById('ae-list-container').scrollTop = 0);

        document.getElementById('btn-close-edit-edit').addEventListener('click', () => document.getElementById('edit-edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-edit-cancel').addEventListener('click', () => document.getElementById('edit-edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-edit-save').addEventListener('click', () => this.saveEditEdit());
        
        document.getElementById('edit-edit-textarea').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    openApplyEdits() {
        if (this.app.state.history.length === 0) return alert("No messages available.");
        const lastMsg = this.app.state.history[this.app.state.history.length - 1];
        if (lastMsg.role !== 'assistant') return alert("Last message must be from the assistant to find edits.");

        const selectFilter = document.getElementById('ae-filter-draft');
        selectFilter.innerHTML = '<option value="All">All Drafts</option>';

        this.extractedEdits = [];
        const draftsToScan = lastMsg.isBatch ? lastMsg.drafts : [lastMsg.drafts[lastMsg.activeDraftIndex]];

        let editIdCounter = 0;

        draftsToScan.forEach((draft, idx) => {
            if (!draft.content) return;
            const shortModel = draft.model ? draft.model.split('/').pop() : 'Unknown';
            const draftLabel = `V${idx+1} | ${shortModel}`;
            
            if (lastMsg.isBatch) {
                const opt = document.createElement('option');
                opt.value = draftLabel;
                opt.textContent = draftLabel;
                selectFilter.appendChild(opt);
            }

            const regex = /(<edit>\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<reasoning>([\s\S]*?)<\/reasoning>\s*<\/edit>)/gi;
            let match;
            while ((match = regex.exec(draft.content)) !== null) {
                const oldText = match[2].trim();
                const newText = match[3].trim();
                if (oldText === newText) continue;

                this.extractedEdits.push({
                    id: editIdCounter++,
                    rawMatch: match[1],
                    oldText: oldText,
                    newText: newText,
                    reasoning: match[4].trim(),
                    sourceDraftIndex: idx,
                    sourceDraftLabel: draftLabel,
                    status: 'invalid',
                    score: 99999999,
                    targetMessageIdx: -1,
                    startIndex: -1,
                    endIndex: -1,
                    groupId: null
                });
            }
        });

        if (this.extractedEdits.length === 0) return alert("No valid <edit> tags found in the latest message.");

        this.evaluateEditsStatus();
        this.buildEditGroups();
        this.renderApplyEditsList();
        document.getElementById('apply-edits-modal').classList.remove('hidden');
    }

    evaluateEditsStatus() {
        const scanHistory = this.app.state.history.slice(-11, -1); 
        const startIndexOffset = Math.max(0, this.app.state.history.length - 11);

        this.extractedEdits.forEach(edit => {
            edit.status = 'invalid';
            edit.targetMessageIdx = -1;
            edit.startIndex = -1;
            edit.endIndex = -1;

            for (let i = scanHistory.length - 1; i >= 0; i--) {
                const content = this.app.state.getContent(startIndexOffset + i);
                
                const oldIdx = content.indexOf(edit.oldText);
                const newIdx = content.indexOf(edit.newText);
                const newIsSubOfOld = edit.oldText.includes(edit.newText);
                
                if (oldIdx !== -1) {
                    edit.status = 'apply';
                    edit.targetMessageIdx = startIndexOffset + i;
                    edit.startIndex = oldIdx;
                    edit.endIndex = oldIdx + edit.oldText.length;
                    edit.score = i * 100000 + oldIdx;
                    break;
                } else if (newIdx !== -1 && !newIsSubOfOld) {
                    edit.status = 'applied';
                    edit.targetMessageIdx = startIndexOffset + i;
                    edit.startIndex = newIdx;
                    edit.endIndex = newIdx + edit.newText.length;
                    edit.score = i * 100000 + newIdx;
                    break;
                }
            }
        });

        this.extractedEdits.sort((a, b) => a.score - b.score);
    }

    buildEditGroups() {
        this.extractedEdits.forEach(e => e.groupId = null);
        let currentGroupId = 1;

        const validEdits = this.extractedEdits.filter(e => e.status === 'apply').sort((a,b) => {
            if (a.targetMessageIdx !== b.targetMessageIdx) return a.targetMessageIdx - b.targetMessageIdx;
            return a.startIndex - b.startIndex;
        });

        const groups = [];
        validEdits.forEach(edit => {
            let placed = false;
            for (let g of groups) {
                if (g.msgIdx === edit.targetMessageIdx) {
                    if (Math.max(edit.startIndex, g.start) <= Math.min(edit.endIndex, g.end)) {
                        edit.groupId = g.id;
                        g.start = Math.min(g.start, edit.startIndex);
                        g.end = Math.max(g.end, edit.endIndex);
                        placed = true;
                        break;
                    }
                }
            }
            if (!placed) {
                edit.groupId = currentGroupId;
                groups.push({ id: currentGroupId, msgIdx: edit.targetMessageIdx, start: edit.startIndex, end: edit.endIndex });
                currentGroupId++;
            }
        });
        
        this.extractedEdits.forEach(e => {
            if (e.groupId === null) e.groupId = currentGroupId++;
        });
    }

    renderApplyEditsList() {
        const container = document.getElementById('ae-list-container');
        const st = container.scrollTop;
        container.innerHTML = '';
        
        const filter = document.getElementById('ae-filter-draft').value;

        const controls = document.createElement('div');
        controls.className = 'ae-controls-bar';
        
        const groupCb = document.createElement('label'); groupCb.className = 'ae-controls-group';
        groupCb.innerHTML = `<input type="checkbox" ${this.aeSettings.groupEdits ? 'checked' : ''}> Group Overlaps`;
        groupCb.querySelector('input').addEventListener('change', (e) => { this.aeSettings.groupEdits = e.target.checked; this.renderApplyEditsList(); });

        const collapseCb = document.createElement('label'); collapseCb.className = 'ae-controls-group';
        collapseCb.innerHTML = `<input type="checkbox" ${this.aeSettings.collapseReasoning ? 'checked' : ''}> Collapse Reasoning`;
        collapseCb.querySelector('input').addEventListener('change', (e) => { 
            this.aeSettings.collapseReasoning = e.target.checked; 
            this.extractedEdits.forEach(ed => ed.isCollapsed = this.aeSettings.collapseReasoning);
            this.renderApplyEditsList(); 
        });

        const invalidCb = document.createElement('label'); invalidCb.className = 'ae-controls-group';
        invalidCb.innerHTML = `<input type="checkbox" ${this.aeSettings.hideInvalid ? 'checked' : ''}> Hide Invalid`;
        invalidCb.querySelector('input').addEventListener('change', (e) => { this.aeSettings.hideInvalid = e.target.checked; this.renderApplyEditsList(); });

        const ctxDiv = document.createElement('div'); ctxDiv.className = 'ae-controls-group';
        ctxDiv.innerHTML = `
            <span>Context Chars:</span>
            <button id="ae-ctx-sub" class="secondary">-</button>
            <input type="number" id="ae-ctx-num" value="${this.aeSettings.contextChars}" min="0" max="100">
            <button id="ae-ctx-add" class="secondary">+</button>
        `;
        
        let ctxDebounce;
        const updateCtx = (val) => {
            this.aeSettings.contextChars = Math.max(0, parseInt(val) || 0);
            clearTimeout(ctxDebounce);
            ctxDebounce = setTimeout(() => this.renderApplyEditsList(), 200);
        };
        ctxDiv.querySelector('#ae-ctx-sub').addEventListener('click', () => updateCtx(this.aeSettings.contextChars - 5));
        ctxDiv.querySelector('#ae-ctx-add').addEventListener('click', () => updateCtx(this.aeSettings.contextChars + 5));
        ctxDiv.querySelector('#ae-ctx-num').addEventListener('change', (e) => updateCtx(e.target.value));

        controls.appendChild(groupCb);
        controls.appendChild(collapseCb);
        controls.appendChild(invalidCb);
        controls.appendChild(ctxDiv);
        container.appendChild(controls);

        const activeEdits = this.extractedEdits.filter(edit => {
            if (filter !== 'All' && edit.sourceDraftLabel !== filter) return false;
            if (this.aeSettings.hideInvalid && edit.status === 'invalid') return false;
            return true;
        });

        const renderedGroups = new Set();

        activeEdits.forEach(edit => {
            if (this.aeSettings.groupEdits && edit.groupId !== null) {
                if (renderedGroups.has(edit.groupId)) return;
                renderedGroups.add(edit.groupId);
                
                const groupEdits = activeEdits.filter(e => e.groupId === edit.groupId);
                if (groupEdits.length > 1) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'ae-group-wrapper';
                    wrapper.innerHTML = `<div class="ae-group-header">▼ GROUP: Overlapping Edits (${groupEdits.length})</div>`;
                    groupEdits.forEach(ge => wrapper.appendChild(this.buildEditCard(ge)));
                    container.appendChild(wrapper);
                } else {
                    container.appendChild(this.buildEditCard(groupEdits[0]));
                }
            } else {
                container.appendChild(this.buildEditCard(edit));
            }
        });
        
        container.scrollTop = st; 
    }

    buildEditCard(edit) {
        const card = document.createElement('div');
        card.className = 'ae-card';

        let preCtx = "", postCtx = "";
        if (edit.status === 'apply') {
            const targetContent = this.app.state.getContent(edit.targetMessageIdx);
            preCtx = targetContent.substring(Math.max(0, edit.startIndex - this.aeSettings.contextChars), edit.startIndex);
            postCtx = targetContent.substring(edit.endIndex, Math.min(targetContent.length, edit.endIndex + this.aeSettings.contextChars));
            preCtx = preCtx.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            postCtx = postCtx.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (preCtx) preCtx = `<span class="ae-context">${preCtx}</span>`;
            if (postCtx) postCtx = `<span class="ae-context">${postCtx}</span>`;
        }

        const diffs = diffWords(edit.oldText, edit.newText);
        
        let statusHtml = '';
        let buttonsHtml = '';

        if (edit.status === 'applied') {
            statusHtml = `<span class="ae-status applied">Already Applied</span>`;
        } else if (edit.status === 'invalid') {
            statusHtml = `<span class="ae-status invalid">Not Found</span>`;
        } else {
            buttonsHtml += `<button class="secondary modify-btn" style="padding: 4px 8px; margin-right: 4px; font-size: 0.85em;">✎ Modify</button>`;
            buttonsHtml += `<button class="primary apply-btn" style="padding: 4px 8px; font-size: 0.85em;">✔️ Apply</button>`;
        }

        edit.isCollapsed = edit.isCollapsed !== undefined ? edit.isCollapsed : this.aeSettings.collapseReasoning;
        
        card.innerHTML = `
            <div class="ae-reasoning-block">
                <span class="ae-reasoning-label">Reasoning ${edit.isCollapsed ? '[+]' : '[-]'}:</span>
                <span class="ae-reasoning-content ${edit.isCollapsed ? 'hidden' : ''}">${edit.reasoning.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
            </div>
            <div class="ae-diff-container">
                <div class="ae-diff-col">${preCtx}${diffs.oldHtml}${postCtx}</div>
                <div class="ae-diff-col">${preCtx}${diffs.newHtml}${postCtx}</div>
            </div>
            <div class="ae-footer">
                <span style="font-size:0.75em; color:var(--text-muted);">${edit.sourceDraftLabel}</span>
                <div class="ae-footer-actions">
                    ${statusHtml}
                    ${buttonsHtml}
                </div>
            </div>
        `;

        card.querySelector('.ae-reasoning-block').addEventListener('click', () => {
            edit.isCollapsed = !edit.isCollapsed;
            const label = card.querySelector('.ae-reasoning-label');
            const content = card.querySelector('.ae-reasoning-content');
            label.textContent = `Reasoning ${edit.isCollapsed ? '[+]' : '[-]'}:`;
            if (edit.isCollapsed) content.classList.add('hidden');
            else content.classList.remove('hidden');
        });

        if (edit.status === 'apply') {
            card.querySelector('.modify-btn').addEventListener('click', () => {
                this.openEditEditModal(edit, preCtx, postCtx);
            });
            card.querySelector('.apply-btn').addEventListener('click', () => {
                const targetContent = this.app.state.getContent(edit.targetMessageIdx);
                const updatedContent = targetContent.substring(0, edit.startIndex) + edit.newText + targetContent.substring(edit.endIndex);
                this.app.state.editTurn(edit.targetMessageIdx, updatedContent);
                this.app.state.buildPromptPayload(); 
                this.app.renderAll();
                this.app.autoSave();
                this.evaluateEditsStatus();
                this.renderApplyEditsList();
            });
        }
        return card;
    }

    openEditEditModal(edit, preCtx = "", postCtx = "") {
        this.currentEditEditing = edit;
        const diffs = diffWords(edit.oldText, edit.newText);
        
        document.getElementById('edit-edit-old-preview').innerHTML = `${preCtx}${diffs.oldHtml}${postCtx}`;
        document.getElementById('edit-edit-new-preview').innerHTML = `${preCtx}${diffs.newHtml}${postCtx}`;
        
        const ta = document.getElementById('edit-edit-textarea');
        ta.value = edit.newText;
        document.getElementById('edit-edit-modal').classList.remove('hidden');
        
        setTimeout(() => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            ta.focus();
        }, 10);
    }

    saveEditEdit() {
        if (!this.currentEditEditing) return;
        const edit = this.currentEditEditing;
        const newText = document.getElementById('edit-edit-textarea').value;
        
        const newRawMatch = `<edit>\n<old>${edit.oldText}</old>\n<new>${newText}</new>\n<reasoning>${edit.reasoning}</reasoning>\n</edit>`;
        
        const msgIdx = this.app.state.history.length - 1;
        const msg = this.app.state.history[msgIdx];
        if (msg && msg.drafts[edit.sourceDraftIndex]) {
            const draft = msg.drafts[edit.sourceDraftIndex];
            draft.content = draft.content.replace(edit.rawMatch, newRawMatch);
            
            if (msg.activeDraftIndex === edit.sourceDraftIndex) {
                const contentNode = document.getElementById(`content-${msgIdx}`);
                if (contentNode) this.app.setNodeContent(contentNode, draft.content, draft);
            }
        }
        
        edit.rawMatch = newRawMatch;
        edit.newText = newText;
        
        this.evaluateEditsStatus();
        this.renderApplyEditsList();
        this.app.autoSave();
        
        document.getElementById('edit-edit-modal').classList.add('hidden');
    }
}