import { settings, StoryState } from '../state/AppSettings.js'; // Adjust path if you split state
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
            const isScrolledUp = (this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight) > 200;
            if (isScrolledUp) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        });
        fab.addEventListener('click', () => this.scrollToBottom());
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

        // Edit Modal
        document.getElementById('btn-edit-cancel').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-save').addEventListener('click', () => {
            const idx = parseInt(document.getElementById('btn-edit-save').dataset.idx);
            this.state.editTurn(idx, document.getElementById('edit-message-content').value);
            document.getElementById('edit-modal').classList.add('hidden');
            this.renderAll();
            this.autoSave();
        });

        // Prompt Modal
        document.getElementById('btn-close-prompt').addEventListener('click', () => document.getElementById('prompt-modal').classList.add('hidden'));
    }

    async handleSend() {
        const text = this.input.value.trim();
        if (!text && this.state.history.length === 0) return;

        if (text) {
            this.state.addTurn('user', text);
            this.input.value = '';
            this.renderAll();
        }

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');

        const messages = this.state.buildPromptPayload();
        
        const count = settings.parallelEnabled ? parseInt(settings.parallelCount) : 1;
        this.activeBatch = new ParallelGenerationBatch(messages, count, settings.parallelOverrides);
        
        const newIdx = this.state.history.length;
        this.state.addBatchTurn(count);
        
        // Setup UI hooks for the new turn
        const domElements = this.appendTurnToDOM('assistant', newIdx);
        
        // Start high-performance timer
        this.batchStartTime = Date.now();
        this.batchTimer = setInterval(() => {
            const timerEl = document.getElementById(`batch-timer-${newIdx}`);
            if (timerEl) timerEl.textContent = `(${((Date.now() - this.batchStartTime)/1000).toFixed(1)}s)`;
        }, 100);

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                // Update state
                this.state.updateBatchDraft(newIdx, draftIdx, data);
                
                // If the updated draft is the actively viewed one, update DOM text
                if (this.state.history[newIdx].activeDraftIndex === draftIdx) {
                    if (data.reasoning) {
                        domElements.reasoningNode.textContent = data.reasoning;
                        domElements.reasoningDiv.classList.remove('hidden');
                    }
                    domElements.contentNode.textContent = data.content;
                    this.scrollToBottom();
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
            
            // Cleanup UI
            if (domElements.cursor) domElements.cursor.remove();
            
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            this.input.focus();
            
            this.renderAll(); 
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
        this.scrollToBottom();
    }

    // Handles rendering a turn entirely from state by its index
    appendTurnToDOM(role, index) {
        const msg = this.state.history[index];
        const isStreaming = this.activeBatch && index === this.state.history.length - 1;
        
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        const content = activeDraft.content;
        const reasoning = activeDraft.reasoning;
        
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';

        // Reasoning Block
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'thinking-block';
        if (!reasoning || (!isStreaming && role === 'assistant')) reasoningDiv.classList.add('hidden');
        const reasoningNode = document.createTextNode(reasoning || '');
        reasoningDiv.appendChild(reasoningNode);
        bubble.appendChild(reasoningDiv);

        // Content Block
        const contentDiv = document.createElement('div');
        contentDiv.className = 'turn-content';
        const contentNode = document.createTextNode(content || '');
        contentDiv.appendChild(contentNode);
        
        let cursor = null;
        if (isStreaming) {
            cursor = document.createElement('span');
            cursor.className = 'streaming-indicator';
            contentDiv.appendChild(cursor);
        }

        bubble.appendChild(contentDiv);
        wrapper.appendChild(bubble);

        // --- BATCH SWITCHER (Appended below text if isBatch) ---
        if (msg.isBatch) {
            const switcher = document.createElement('div');
            switcher.className = 'draft-switcher';
            
            const btnPrev = document.createElement('button');
            btnPrev.textContent = '◀';
            btnPrev.onclick = () => this.switchDraft(index, -1);
            
            const select = document.createElement('select');
            msg.drafts.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `V${i+1} | ${d.model ? d.model.split('/').pop() : 'Unknown'}`;
                if (i === msg.activeDraftIndex) opt.selected = true;
                select.appendChild(opt);
            });
            select.onchange = (e) => {
                this.state.setActiveDraft(index, parseInt(e.target.value));
                this.renderAll();
            };

            const btnNext = document.createElement('button');
            btnNext.textContent = '▶';
            btnNext.onclick = () => this.switchDraft(index, 1);

            const statusDiv = document.createElement('div');
            statusDiv.style.marginLeft = '8px';
            msg.drafts.forEach((d, i) => {
                const span = document.createElement('span');
                span.id = `draft-icon-${index}-${i}`;
                span.textContent = d.status === 'done' ? '✔️' : (d.status === 'error' ? '❌' : '🕒');
                if (i === msg.activeDraftIndex) span.style.border = '1px solid var(--accent)';
                statusDiv.appendChild(span);
            });

            const timerSpan = document.createElement('span');
            timerSpan.id = `batch-timer-${index}`;
            timerSpan.style.marginLeft = '4px';
            if (!isStreaming) timerSpan.textContent = `(${activeDraft.duration}s)`;

            switcher.appendChild(btnPrev);
            switcher.appendChild(select);
            switcher.appendChild(btnNext);
            switcher.appendChild(statusDiv);
            switcher.appendChild(timerSpan);
            
            wrapper.appendChild(switcher);
        }

        // --- ACTION BAR ---
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
                    reasoningDiv.classList.toggle('hidden');
                    btnThink.classList.toggle('active');
                });
                iconsDiv.appendChild(btnThink);
            }

            const btnCopy = document.createElement('span');
            btnCopy.textContent = '📋';
            btnCopy.title = "Copy";
            btnCopy.addEventListener('click', () => navigator.clipboard.writeText(content));
            iconsDiv.appendChild(btnCopy);

            const btnEdit = document.createElement('span');
            btnEdit.textContent = '✏️';
            btnEdit.title = "Edit";
            btnEdit.addEventListener('click', () => {
                document.getElementById('edit-message-content').value = content;
                document.getElementById('btn-edit-save').dataset.idx = index;
                document.getElementById('edit-modal').classList.remove('hidden');
            });
            iconsDiv.appendChild(btnEdit);

            if (role === 'assistant' && index === this.state.history.length - 1 && this.state.lastRawPayload) {
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
                    this.renderAll();
                    this.autoSave();
                }
            });
            iconsDiv.appendChild(btnDelete);

            actionBar.appendChild(iconsDiv);
            wrapper.appendChild(actionBar);
        }

        this.container.appendChild(wrapper);

        return { contentNode, reasoningNode, reasoningDiv, cursor };
    }

    switchDraft(msgIndex, dir) {
        const msg = this.state.history[msgIndex];
        const len = msg.drafts.length;
        const newIdx = (msg.activeDraftIndex + dir + len) % len;
        this.state.setActiveDraft(msgIndex, newIdx);
        this.renderAll();
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