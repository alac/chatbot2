import { settings } from '../state/AppSettings.js';
import { StoryState } from '../state/StoryState.js';
import { ParallelGenerationBatch } from '../api/OpenAIClient.js';
import { StorageManager } from '../storage/StorageManager.js';

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
        
        // Track manual scrolling to pause auto-scroll
        this.isUserScrolledUp = false;

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
        document.getElementById('btn-abort').addEventListener('click', () => this.handleAbort());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSend(); }
        });
        document.getElementById('mode-selector').addEventListener('change', (e) => {
            this.state.mode = e.target.value;
            this.renderAll();
            this.autoSave();
        });

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

    async handleSend() {
        const text = this.input.value.trim();
        if (!text && this.state.history.length === 0) return;

        if (text) {
            this.state.addTurn('user', text);
            this.input.value = '';
            this.renderAll(); // Renders the user message
        }

        // Before starting a new turn, remove the draft switcher from the PREVIOUS message to lock it in
        const oldSwitcher = document.getElementById(`switcher-${this.state.history.length - 1}`);
        if (oldSwitcher) oldSwitcher.remove();

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.isUserScrolledUp = false;

        const messages = this.state.buildPromptPayload();
        const count = settings.parallelEnabled ? parseInt(settings.parallelCount) : 1;
        this.activeBatch = new ParallelGenerationBatch(messages, count, settings.parallelOverrides);
        
        const newIdx = this.state.history.length;
        this.state.addBatchTurn(count);
        
        // Render the empty shell
        this.appendTurnToDOM('assistant', newIdx);
        
        // Start high-performance timer
        this.batchStartTime = Date.now();
        this.batchTimer = setInterval(() => {
            const timerEl = document.getElementById(`batch-timer-${newIdx}`);
            if (timerEl) timerEl.textContent = `(${((Date.now() - this.batchStartTime)/1000).toFixed(1)}s)`;
        }, 100);

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                this.state.updateBatchDraft(newIdx, draftIdx, data);
                
                // If the updated draft is the actively viewed one, update DOM text directly by ID
                if (this.state.history[newIdx].activeDraftIndex === draftIdx) {
                    const contentNode = document.getElementById(`content-${newIdx}`);
                    const reasonNode = document.getElementById(`reasoning-${newIdx}`);
                    const reasonDiv = document.getElementById(`reasoning-block-${newIdx}`);
                    
                    if (data.reasoning) {
                        if (reasonNode) reasonNode.textContent = data.reasoning;
                        if (reasonDiv) reasonDiv.classList.remove('hidden');
                    }
                    if (contentNode) contentNode.textContent = data.content;
                    
                    if (!this.isUserScrolledUp) this.scrollToBottom();
                }

                // Update Switcher Icons
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
            this.input.focus();
            
            // Re-render only the finalized message to insert the Action Bar
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            this.appendTurnToDOM('assistant', newIdx);

            if (!this.isUserScrolledUp) this.scrollToBottom();
            this.autoSave();
        }
    }

    handleAbort() {
        if (this.activeBatch) this.activeBatch.cancelAll();
    }

    renderAll() {
        this.container.innerHTML = '';
        this.container.className = `${this.state.mode}-mode`;
        this.state.history.forEach((turn, idx) => {
            this.appendTurnToDOM(turn.role, idx);
        });
        if (!this.isUserScrolledUp) this.scrollToBottom();
    }

    appendTurnToDOM(role, index) {
        const msg = this.state.history[index];
        const isStreaming = this.activeBatch && index === this.state.history.length - 1;
        const isLatestMessage = index === this.state.history.length - 1;
        
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        const content = activeDraft.content;
        const reasoning = activeDraft.reasoning;
        
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;
        wrapper.id = `turn-wrapper-${index}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';

        // --- ACTION BAR (Top of bubble) ---
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
            btnCopy.addEventListener('click', () => navigator.clipboard.writeText(this.state.getContent(index)));
            iconsDiv.appendChild(btnCopy);

            const btnEdit = document.createElement('span');
            btnEdit.textContent = '✏️';
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
                btnPrompt.addEventListener('click', () => {
                    document.getElementById('prompt-payload-content').textContent = JSON.stringify(this.state.lastRawPayload, null, 2);
                    document.getElementById('prompt-modal').classList.remove('hidden');
                });
                iconsDiv.appendChild(btnPrompt);
            }

            const btnDelete = document.createElement('span');
            btnDelete.textContent = '🗑️';
            btnDelete.addEventListener('click', () => {
                if (confirm("Delete this message?")) {
                    this.state.deleteTurn(index);
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
        
        const reasoningNode = document.createTextNode(reasoning || '');
        reasoningDiv.appendChild(reasoningNode);
        // Save reference for direct DOM updates
        const spanReason = document.createElement('span');
        spanReason.id = `reasoning-${index}`;
        spanReason.appendChild(reasoningNode);
        reasoningDiv.innerHTML = '';
        reasoningDiv.appendChild(spanReason);
        
        bubble.appendChild(reasoningDiv);

        // --- CONTENT BLOCK ---
        const contentDiv = document.createElement('div');
        contentDiv.className = 'turn-content';
        
        const spanContent = document.createElement('span');
        spanContent.id = `content-${index}`;
        spanContent.textContent = content || '';
        contentDiv.appendChild(spanContent);
        
        if (isStreaming) {
            const cursor = document.createElement('span');
            cursor.className = 'streaming-indicator';
            cursor.id = `cursor-${index}`;
            contentDiv.appendChild(cursor);
        }

        bubble.appendChild(contentDiv);
        wrapper.appendChild(bubble);

        // --- BATCH SWITCHER ---
        // Only render on the very last message if it's a batch with multiple drafts
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
            msg.drafts.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `V${i+1} | ${d.model ? d.model.split('/').pop() : 'Unknown'}`;
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

    // Direct DOM update switching (Prevents jumping and recreating DOM)
    switchDraft(msgIndex, dir) {
        const msg = this.state.history[msgIndex];
        const len = msg.drafts.length;
        const newIdx = (msg.activeDraftIndex + dir + len) % len;
        this.switchDraftExplicit(msgIndex, newIdx);
    }

    switchDraftExplicit(msgIndex, draftIdx) {
        this.state.setActiveDraft(msgIndex, draftIdx);
        
        // 1. Update text nodes
        const contentNode = document.getElementById(`content-${msgIndex}`);
        const reasonNode = document.getElementById(`reasoning-${msgIndex}`);
        const reasonDiv = document.getElementById(`reasoning-block-${msgIndex}`);
        
        const newText = this.state.getContent(msgIndex);
        const newReasoning = this.state.getReasoning(msgIndex);

        if (contentNode) contentNode.textContent = newText;
        if (reasonNode) reasonNode.textContent = newReasoning;
        
        if (reasonDiv) {
            if (newReasoning) reasonDiv.classList.remove('hidden');
            else reasonDiv.classList.add('hidden');
        }

        // 2. Update Switcher Select
        const select = document.getElementById(`draft-select-${msgIndex}`);
        if (select) select.value = draftIdx;

        // 3. Update active icon underline
        const msg = this.state.history[msgIndex];
        msg.drafts.forEach((_, i) => {
            const icon = document.getElementById(`draft-icon-${msgIndex}-${i}`);
            if (icon) {
                if (i === draftIdx) icon.classList.add('active-icon');
                else icon.classList.remove('active-icon');
            }
        });

        // 4. Update Timer display if finished
        const timer = document.getElementById(`batch-timer-${msgIndex}`);
        if (timer && !this.activeBatch) {
            timer.textContent = `(${msg.drafts[draftIdx].duration}s)`;
        }
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
            document.getElementById('mode-selector').value = this.state.mode;
        } else {
            this.state.clear(); 
        }
        this.renderAll();
    }
}