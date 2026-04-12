import { settings } from '../state/AppSettings.js';
import { StoryState } from '../state/StoryState.js';
import { ParallelGenerationBatch } from '../api/OpenAIClient.js';
import { StorageManager } from '../storage/StorageManager.js';
import { diffWords } from '../utils/diff.js';

export class UIManager {
    constructor() {
        this.state = new StoryState();
        this.storage = new StorageManager();
        this.activeBatch = null;
        this.activeSlot = 1;
        this.batchTimer = null;
        this.batchStartTime = 0;
        
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');
        
        this.isUserScrolledUp = false;
        this.extractedEdits = [];

        this.bindEvents();
        this.initApp();
    }

    async initApp() {
        await this.storage.init();
        const lastSlot = localStorage.getItem('last_active_slot') || 1;
        this.activeSlot = parseInt(lastSlot);
        await this.loadStateFromSlot(this.activeSlot);
        
        const fab = document.getElementById('btn-jump-bottom');
        this.container.addEventListener('scroll', () => {
            this.isUserScrolledUp = (this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight) > 50;
            if (this.isUserScrolledUp) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        });
        fab.addEventListener('click', () => {
            this.isUserScrolledUp = false;
            this.scrollToBottom();
        });
    }

    bindEvents() {
        document.getElementById('btn-send').addEventListener('click', () => this.handleSend());
        document.getElementById('btn-retry').addEventListener('click', () => this.handleRetry());
        document.getElementById('btn-abort').addEventListener('click', () => this.handleAbort());
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSend(); }
        });

        // Quick Menu Toggle
        document.getElementById('btn-more-menu').addEventListener('click', () => {
            document.getElementById('quick-menu').classList.toggle('hidden');
        });

        // Undo / Redo
        document.getElementById('btn-undo').addEventListener('click', () => {
            if (this.state.undo()) { this.renderAll(); this.autoSave(); }
        });
        document.getElementById('btn-redo').addEventListener('click', () => {
            if (this.state.redo()) { this.renderAll(); this.autoSave(); }
        });

        // Quick Replies
        document.getElementById('btn-open-quick-replies').addEventListener('click', () => this.openQuickReplies());
        document.getElementById('btn-close-qr').addEventListener('click', () => document.getElementById('quick-replies-modal').classList.add('hidden'));
        document.getElementById('btn-edit-qr-toggle').addEventListener('click', () => {
            const isEditing = !document.getElementById('qr-edit-container').classList.contains('hidden');
            if (isEditing) {
                document.getElementById('qr-edit-container').classList.add('hidden');
                document.getElementById('qr-button-container').classList.remove('hidden');
            } else {
                document.getElementById('qr-edit-textarea').value = settings.quickReplies;
                document.getElementById('qr-edit-container').classList.remove('hidden');
                document.getElementById('qr-button-container').classList.add('hidden');
            }
        });
        document.getElementById('btn-save-qr').addEventListener('click', () => {
            settings.quickReplies = document.getElementById('qr-edit-textarea').value;
            settings.save();
            document.getElementById('qr-edit-container').classList.add('hidden');
            document.getElementById('qr-button-container').classList.remove('hidden');
            this.openQuickReplies(); 
        });

        // Apply Edits
        document.getElementById('btn-open-apply-edits').addEventListener('click', () => this.openApplyEdits());
        document.getElementById('btn-close-ae').addEventListener('click', () => document.getElementById('apply-edits-modal').classList.add('hidden'));
        document.getElementById('ae-filter-draft').addEventListener('change', () => this.renderApplyEditsList());

        // Modals
        document.getElementById('btn-edit-cancel').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-save').addEventListener('click', () => {
            const idx = parseInt(document.getElementById('btn-edit-save').dataset.idx);
            this.state.editTurn(idx, document.getElementById('edit-message-content').value);
            document.getElementById('edit-modal').classList.add('hidden');
            this.renderAll();
            this.autoSave();
        });
        document.getElementById('btn-close-prompt').addEventListener('click', () => document.getElementById('prompt-modal').classList.add('hidden'));
    }

    handleRetry() {
        if (this.state.history.length === 0) return;
        const last = this.state.history[this.state.history.length - 1];
        if (last.role === 'assistant') {
            this.state.undo(); // Moves assistant msg to redo stack
            this.renderAll();
            this.handleSend(true); // pass true so it doesn't try to add input box content
        }
    }

    async handleSend(isRetry = false) {
        const text = this.input.value.trim();
        
        if (!isRetry) {
            if (!text && this.state.history.length === 0) return;
            if (text) {
                this.state.addTurn('user', text);
                this.input.value = '';
                this.renderAll(); 
            }
        }

        // Lock in previous switcher
        const oldSwitcher = document.getElementById(`switcher-${this.state.history.length - 1}`);
        if (oldSwitcher) oldSwitcher.remove();

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.isUserScrolledUp = false;

        const messages = this.state.buildPromptPayload();
        const count = settings.parallelEnabled ? parseInt(settings.parallelCount) : 1;
        this.activeBatch = new ParallelGenerationBatch(messages, count, settings.parallelOverrides);
        
        const newIdx = this.state.history.length;
        this.state.addBatchTurn(count);
        this.appendTurnToDOM('assistant', newIdx);
        
        this.batchStartTime = Date.now();
        this.batchTimer = setInterval(() => {
            const timerEl = document.getElementById(`batch-timer-${newIdx}`);
            if (timerEl) timerEl.textContent = `(${((Date.now() - this.batchStartTime)/1000).toFixed(1)}s)`;
        }, 100);

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                this.state.updateBatchDraft(newIdx, draftIdx, data);
                if (this.state.history[newIdx].activeDraftIndex === draftIdx) {
                    const contentNode = document.getElementById(`content-${newIdx}`);
                    const reasonNode = document.getElementById(`reasoning-${newIdx}`);
                    const reasonDiv = document.getElementById(`reasoning-block-${newIdx}`);
                    
                    if (data.reasoning) {
                        if (reasonNode) reasonNode.textContent = data.reasoning;
                        if (reasonDiv) reasonDiv.classList.remove('hidden');
                    }
                    if (contentNode) this.setNodeContent(contentNode, data.content);
                    
                    if (!this.isUserScrolledUp) this.scrollToBottom();
                }

                const iconEl = document.getElementById(`draft-icon-${newIdx}-${draftIdx}`);
                if (iconEl) {
                    iconEl.textContent = data.status === 'done' ? '✔️' : (data.status === 'error' ? '❌' : '🕒');
                }
            });
        } finally {
            clearInterval(this.batchTimer);
            if (this.activeBatch && this.activeBatch.jobs[0]) {
                this.state.lastRawPayload = this.activeBatch.jobs[0].rawPayload;
            }
            this.activeBatch = null;
            
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');
            this.input.focus();
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            
            // Generate full payload logic again to establish context boundaries
            this.state.buildPromptPayload();

            this.appendTurnToDOM('assistant', newIdx);

            if (!this.isUserScrolledUp) this.scrollToBottom();
            this.autoSave();
        }
    }

    handleAbort() {
        if (this.activeBatch) this.activeBatch.cancelAll();
    }

    setNodeContent(node, content) {
        const visuallyApplied = settings.applyRegexes(content, 'visually');
        if (settings.renderMarkdown) {
            node.innerHTML = marked.parse(visuallyApplied);
            node.classList.add('markdown-body');
        } else {
            node.textContent = visuallyApplied;
            node.classList.remove('markdown-body');
        }
    }

    renderAll() {
        this.container.innerHTML = '';
        this.container.className = `${settings.displayMode}-mode`;
        this.state.history.forEach((turn, idx) => {
            // Render Divider explicitly before the first IN-CONTEXT message if there is a boundary
            if (idx === this.state.contextBoundaryIndex + 1) {
                const divider = document.createElement('div');
                divider.className = 'context-divider';
                divider.textContent = 'Context Boundary';
                this.container.appendChild(divider);
            }
            this.appendTurnToDOM(turn.role, idx);
        });
        if (!this.isUserScrolledUp) this.scrollToBottom();
    }

    appendTurnToDOM(role, index) {
        const msg = this.state.history[index];
        const isStreaming = this.activeBatch && index === this.state.history.length - 1;
        const isLatestMessage = index === this.state.history.length - 1;
        const isOutOfContext = index <= this.state.contextBoundaryIndex;
        
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        const content = activeDraft.content;
        const reasoning = activeDraft.reasoning;
        
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;
        if (isOutOfContext) wrapper.classList.add('out-of-context');
        wrapper.id = `turn-wrapper-${index}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';

        // --- ACTION BAR (Moved to top of bubble) ---
        if (!isStreaming) {
            const actionBar = document.createElement('div');
            actionBar.className = 'action-bar';
            
            const metaSpan = document.createElement('span');
            if (activeDraft.model) {
                const shortModel = activeDraft.model.split('/').pop();
                metaSpan.textContent = `${shortModel} • ${activeDraft.duration}s`;
            }
            actionBar.appendChild(metaSpan);

            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'action-icons';

            if (reasoning) {
                const btnThink = document.createElement('span');
                btnThink.textContent = '🧠';
                btnThink.className = 'think-toggle';
                btnThink.title = "Toggle Thinking";
                btnThink.addEventListener('click', () => {
                    const rDiv = document.getElementById(`reasoning-block-${index}`);
                    if (rDiv) {
                        rDiv.classList.toggle('hidden');
                        btnThink.classList.toggle('active');
                    }
                });
                iconsDiv.appendChild(btnThink);
            }

            const btnCopy = document.createElement('span');
            btnCopy.textContent = '📋';
            btnCopy.title = "Copy";
            btnCopy.addEventListener('click', () => navigator.clipboard.writeText(this.state.getContent(index)));
            iconsDiv.appendChild(btnCopy);

            const btnEdit = document.createElement('span');
            btnEdit.textContent = '✏️';
            btnEdit.title = "Edit";
            btnEdit.addEventListener('click', () => {
                document.getElementById('edit-message-content').value = this.state.getContent(index);
                document.getElementById('btn-edit-save').dataset.idx = index;
                document.getElementById('edit-modal').classList.remove('hidden');
            });
            iconsDiv.appendChild(btnEdit);

            // View Prompt (Only for latest assistant message)
            if (role === 'assistant' && isLatestMessage && this.state.lastRawPayload) {
                const btnPrompt = document.createElement('span');
                btnPrompt.textContent = '🔍';
                btnPrompt.title = "View Prompt Payload";
                btnPrompt.addEventListener('click', () => {
                    document.getElementById('prompt-payload-content').textContent = JSON.stringify(this.state.lastRawPayload, null, 2);
                    document.getElementById('prompt-modal').classList.remove('hidden');
                });
                iconsDiv.appendChild(btnPrompt);
            }

            const btnDelete = document.createElement('span');
            btnDelete.textContent = '🗑️';
            btnDelete.title = "Delete";
            btnDelete.addEventListener('click', () => {
                if (confirm("Delete this message?")) {
                    this.state.deleteTurn(index);
                    this.state.buildPromptPayload(); // Refresh boundaries
                    this.renderAll();
                    this.autoSave();
                }
            });
            iconsDiv.appendChild(btnDelete);

            actionBar.appendChild(iconsDiv);
            bubble.appendChild(actionBar);
        }

        // --- REASONING BLOCK ---
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'thinking-block';
        reasoningDiv.id = `reasoning-block-${index}`;
        if (!reasoning || (!isStreaming && role === 'assistant')) reasoningDiv.classList.add('hidden');
        
        const spanReason = document.createElement('span');
        spanReason.id = `reasoning-${index}`;
        spanReason.textContent = reasoning || '';
        reasoningDiv.appendChild(spanReason);
        
        bubble.appendChild(reasoningDiv);

        // --- CONTENT BLOCK ---
        const contentDiv = document.createElement('div');
        contentDiv.className = 'turn-content';
        
        const spanContent = document.createElement('div');
        spanContent.style.display = "inline";
        spanContent.id = `content-${index}`;
        this.setNodeContent(spanContent, content || '');
        contentDiv.appendChild(spanContent);
        
        if (isStreaming) {
            const cursor = document.createElement('span');
            cursor.className = 'streaming-indicator';
            cursor.id = `cursor-${index}`;
            contentDiv.appendChild(cursor);
        }

        bubble.appendChild(contentDiv);
        wrapper.appendChild(bubble);

        // --- BATCH SWITCHER (Appended below bubble if isBatch) ---
        if (msg.isBatch && msg.drafts.length > 1 && isLatestMessage) {
            const switcher = document.createElement('div');
            switcher.className = 'draft-switcher';
            switcher.id = `switcher-${index}`;
            
            const controlsRow = document.createElement('div');
            controlsRow.className = 'switcher-controls';

            const btnPrev = document.createElement('button');
            btnPrev.textContent = '◀';
            btnPrev.onclick = () => this.switchDraft(index, -1);
            
            const select = document.createElement('select');
            select.id = `draft-select-${index}`;
            // Pre-populate with current model names for accurate UI during stream
            msg.drafts.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                
                // Read the model from the job array if streaming, otherwise from draft
                let modelStr = d.model;
                if (isStreaming && this.activeBatch && this.activeBatch.jobs[i]) {
                    modelStr = this.activeBatch.jobs[i].model;
                }
                
                opt.textContent = `V${i+1} | ${modelStr ? modelStr.split('/').pop() : 'Unknown'}`;
                if (i === msg.activeDraftIndex) opt.selected = true;
                select.appendChild(opt);
            });
            select.onchange = (e) => this.switchDraftExplicit(index, parseInt(e.target.value));

            const btnNext = document.createElement('button');
            btnNext.textContent = '▶';
            btnNext.onclick = () => this.switchDraft(index, 1);

            controlsRow.appendChild(btnPrev);
            controlsRow.appendChild(select);
            controlsRow.appendChild(btnNext);

            const statusRow = document.createElement('div');
            statusRow.className = 'switcher-status';
            
            msg.drafts.forEach((d, i) => {
                const span = document.createElement('span');
                span.id = `draft-icon-${index}-${i}`;
                span.textContent = d.status === 'done' ? '✔️' : (d.status === 'error' ? '❌' : '🕒');
                if (i === msg.activeDraftIndex) span.classList.add('active-icon');
                statusRow.appendChild(span);
            });

            const timerSpan = document.createElement('span');
            timerSpan.id = `batch-timer-${index}`;
            if (!isStreaming) timerSpan.textContent = `(${activeDraft.duration}s)`;

            statusRow.appendChild(timerSpan);

            switcher.appendChild(controlsRow);
            switcher.appendChild(statusRow);
            wrapper.appendChild(switcher);
        }

        this.container.appendChild(wrapper);
    }

    switchDraft(msgIndex, dir) {
        const msg = this.state.history[msgIndex];
        const len = msg.drafts.length;
        const newIdx = (msg.activeDraftIndex + dir + len) % len;
        this.switchDraftExplicit(msgIndex, newIdx);
    }

    switchDraftExplicit(msgIndex, draftIdx) {
        this.state.setActiveDraft(msgIndex, draftIdx);
        
        const contentNode = document.getElementById(`content-${msgIndex}`);
        const reasonNode = document.getElementById(`reasoning-${msgIndex}`);
        const reasonDiv = document.getElementById(`reasoning-block-${msgIndex}`);
        
        const newText = this.state.getContent(msgIndex);
        const newReasoning = this.state.getReasoning(msgIndex);

        if (contentNode) this.setNodeContent(contentNode, newText);
        if (reasonNode) reasonNode.textContent = newReasoning;
        
        if (reasonDiv) {
            if (newReasoning) reasonDiv.classList.remove('hidden');
            else reasonDiv.classList.add('hidden');
        }

        const select = document.getElementById(`draft-select-${msgIndex}`);
        if (select) select.value = draftIdx;

        const msg = this.state.history[msgIndex];
        msg.drafts.forEach((_, i) => {
            const icon = document.getElementById(`draft-icon-${msgIndex}-${i}`);
            if (icon) {
                if (i === draftIdx) icon.classList.add('active-icon');
                else icon.classList.remove('active-icon');
            }
        });

        const timer = document.getElementById(`batch-timer-${msgIndex}`);
        if (timer && !this.activeBatch) {
            timer.textContent = `(${msg.drafts[draftIdx].duration}s)`;
        }
    }

    // --- QUICK REPLIES ---
    openQuickReplies() {
        const container = document.getElementById('qr-button-container');
        container.innerHTML = '';
        
        const raw = settings.quickReplies || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const btn = document.createElement('button');
            btn.className = 'primary';
            btn.textContent = title;
            btn.title = content;
            btn.addEventListener('click', () => {
                this.input.value = content;
                document.getElementById('quick-replies-modal').classList.add('hidden');
                this.input.focus();
            });
            container.appendChild(btn);
        });

        document.getElementById('quick-replies-modal').classList.remove('hidden');
    }

    // --- APPLY EDITS ---
    openApplyEdits() {
        if (this.state.history.length === 0) return alert("No messages available.");
        const lastMsg = this.state.history[this.state.history.length - 1];
        if (lastMsg.role !== 'assistant') return alert("Last message must be from the assistant to find edits.");

        const selectFilter = document.getElementById('ae-filter-draft');
        selectFilter.innerHTML = '<option value="All">All Drafts</option>';

        this.extractedEdits = [];

        // Scan the drafts
        const draftsToScan = lastMsg.isBatch ? lastMsg.drafts : [lastMsg.drafts[lastMsg.activeDraftIndex]];

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

            const regex = /<edit>\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<reasoning>([\s\S]*?)<\/reasoning>\s*<\/edit>/gi;
            let match;
            while ((match = regex.exec(draft.content)) !== null) {
                this.extractedEdits.push({
                    oldText: match[1].trim(),
                    newText: match[2].trim(),
                    reasoning: match[3].trim(),
                    sourceDraft: draftLabel,
                    score: 99999999
                });
            }
        });

        if (this.extractedEdits.length === 0) return alert("No <edit> tags found in the latest message.");

        this.evaluateEditsStatus();
        this.renderApplyEditsList();
        document.getElementById('apply-edits-modal').classList.remove('hidden');
    }

    evaluateEditsStatus() {
        // Validation & Scoring (Scan last 10 messages)
        const scanHistory = this.state.history.slice(-11, -1); 
        const startIndexOffset = Math.max(0, this.state.history.length - 11);

        this.extractedEdits.forEach(edit => {
            edit.status = 'invalid';
            edit.targetMessageIdx = -1;

            // Search backwards so more recent matches get processed
            for (let i = scanHistory.length - 1; i >= 0; i--) {
                const content = this.state.getContent(startIndexOffset + i);
                
                // Check if already applied
                if (content.includes(edit.newText)) {
                    edit.status = 'applied';
                    edit.score = i * 100000 + content.indexOf(edit.newText); // Sort older to top
                    break;
                }
                
                // Check if applicable
                if (content.includes(edit.oldText)) {
                    edit.status = 'apply';
                    edit.targetMessageIdx = startIndexOffset + i;
                    edit.score = i * 100000 + content.indexOf(edit.oldText);
                    break;
                }
            }
        });

        // Sort by score ascending
        this.extractedEdits.sort((a, b) => a.score - b.score);
    }

    renderApplyEditsList() {
        const container = document.getElementById('ae-list-container');
        const st = container.scrollTop;
        container.innerHTML = '';
        
        const filter = document.getElementById('ae-filter-draft').value;

        this.extractedEdits.forEach(edit => {
            if (filter !== 'All' && edit.sourceDraft !== filter) return;

            const card = document.createElement('div');
            card.className = 'ae-card';
            const diffs = diffWords(edit.oldText, edit.newText);

            let actionHtml = '';
            if (edit.status === 'applied') {
                actionHtml = `<span class="ae-status applied">Already Applied</span>`;
            } else if (edit.status === 'invalid') {
                actionHtml = `<span class="ae-status invalid">Text Not Found</span>`;
            } else {
                actionHtml = `<button class="primary apply-btn">Apply Edit</button>`;
            }

            card.innerHTML = `
                <div class="ae-reasoning">${edit.reasoning.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                <div class="ae-diff-container">
                    <div class="ae-diff-col">${diffs.oldHtml}</div>
                    <div class="ae-diff-col">${diffs.newHtml}</div>
                </div>
                <div class="ae-footer">
                    <span style="font-size:0.8em; color:var(--text-muted);">${edit.sourceDraft}</span>
                    ${actionHtml}
                </div>
            `;

            if (edit.status === 'apply') {
                card.querySelector('.apply-btn').addEventListener('click', () => {
                    // Apply the edit
                    const targetContent = this.state.getContent(edit.targetMessageIdx);
                    const updatedContent = targetContent.replace(edit.oldText, edit.newText);
                    this.state.editTurn(edit.targetMessageIdx, updatedContent);
                    
                    // Re-render chat background
                    this.state.buildPromptPayload(); // refresh boundaries
                    this.renderAll();
                    this.autoSave();
                    
                    // Re-evaluate list dynamically instead of closing modal
                    this.evaluateEditsStatus();
                    this.renderApplyEditsList();
                });
            }

            container.appendChild(card);
        });
        
        container.scrollTop = st; // Restore scroll position after internal layout wipe
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
        document.getElementById('btn-jump-bottom').classList.add('hidden');
    }

    async autoSave() {
        await this.storage.saveSlot(this.activeSlot, `Slot ${this.activeSlot}`, `Auto-saved`, this.state.exportData());
        localStorage.setItem('last_active_slot', this.activeSlot);
        if (window.settingsUI) window.settingsUI.refreshSlotList();
    }

    async loadStateFromSlot(id) {
        const slot = await this.storage.loadSlot(id);
        if (slot && slot.data) {
            this.state.loadFromData(slot.data);
            document.getElementById('set-display-mode').value = settings.displayMode;
        } else {
            this.state.clear(); 
        }
        this.state.buildPromptPayload(); // setup initial context limits correctly
        this.renderAll();
    }
}