import { settings, StoryState } from '../state.js';
import { GenerationJob } from '../api/OpenAIClient.js';
import { StorageManager } from '../storage/StorageManager.js';

export class UIManager {
    constructor() {
        this.state = new StoryState();
        this.storage = new StorageManager();
        this.currentJob = null;
        this.activeSlot = 1;
        
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');
        
        this.bindEvents();
        this.initApp();
    }

    async initApp() {
        await this.storage.init();
        
        // Auto-load last session
        const lastSlot = localStorage.getItem('last_active_slot') || 1;
        this.activeSlot = parseInt(lastSlot);
        await this.loadStateFromSlot(this.activeSlot);
        
        // Scroll listener for Jump to Bottom FAB
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
        this.currentJob = new GenerationJob();
        
        const newIdx = this.state.history.length;
        this.state.addTurn('assistant', '');
        const domElements = this.appendTurnToDOM('assistant', '', '', {}, newIdx);

        try {
            // Because our stream yields the absolute parsed strings, we just overwrite textContent
            for await (const state of this.currentJob.streamGeneration(messages)) {
                
                // Update Reasoning Node
                if (state.reasoning) {
                    domElements.reasoningNode.textContent = state.reasoning;
                    domElements.reasoningDiv.classList.remove('hidden');
                }

                // Update Content Node
                domElements.contentNode.textContent = state.content;
                this.scrollToBottom();
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.error(error);
                domElements.contentNode.textContent += `\n[Error: ${error.message}]`;
            }
        } finally {
            domElements.cursor.remove();
            
            // Hide reasoning by default when finished
            if (this.currentJob.finalReasoning) {
                domElements.reasoningDiv.classList.add('hidden');
            }
            
            // Sync final state
            this.state.history[newIdx].content = this.currentJob.finalContent;
            this.state.history[newIdx].reasoning = this.currentJob.finalReasoning;
            this.state.history[newIdx].meta = {
                model: settings.model,
                duration: this.currentJob.duration
            };
            this.state.lastRawPayload = this.currentJob.rawPayload;

            // If a strict API (like GLM) rejected the <think> prompt and returned nothing
            if (!this.currentJob.finalContent && !this.currentJob.finalReasoning) {
                domElements.contentNode.textContent = "[Empty Response. The model may have rejected the forced <think> prefix.]";
            }

            this.currentJob = null;
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            this.input.focus();
            
            this.renderAll(); 
            this.autoSave();
        }
    }

    handleAbort() {
        if (this.currentJob) this.currentJob.cancel();
    }

    renderAll() {
        this.container.innerHTML = '';
        this.container.className = `${this.state.mode}-mode`;
        this.state.history.forEach((turn, idx) => {
            this.appendTurnToDOM(turn.role, turn.content, turn.reasoning, turn.meta, idx);
        });
        this.scrollToBottom();
    }

    appendTurnToDOM(role, content, reasoning, meta, index) {
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';

        // Reasoning Block
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'thinking-block hidden';
        const reasoningNode = document.createTextNode(reasoning || '');
        reasoningDiv.appendChild(reasoningNode);
        bubble.appendChild(reasoningDiv);

        // Content Block
        const contentDiv = document.createElement('div');
        contentDiv.className = 'turn-content';
        const contentNode = document.createTextNode(content || '');
        contentDiv.appendChild(contentNode);
        
        // Streaming Cursor (only added if this is a live generation)
        const cursor = document.createElement('span');
        if (this.currentJob && index === this.state.history.length - 1) {
            cursor.className = 'streaming-indicator';
            contentDiv.appendChild(cursor);
        }

        bubble.appendChild(contentDiv);
        wrapper.appendChild(bubble);

        // Action Bar (Not shown during streaming)
        if (!this.currentJob || index < this.state.history.length - 1) {
            const actionBar = document.createElement('div');
            actionBar.className = 'action-bar';
            
            // Metadata (Left)
            const metaSpan = document.createElement('span');
            if (meta && meta.model) {
                const shortModel = meta.model.split('/').pop();
                metaSpan.textContent = `${shortModel} • ${meta.duration}s`;
            }
            actionBar.appendChild(metaSpan);

            // Icons (Right)
            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'action-icons';

            if (reasoning) {
                const btnThink = document.createElement('span');
                btnThink.textContent = '🧠';
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
                document.getElementById('edit-message-content').value = this.state.history[index].content;
                document.getElementById('btn-edit-save').dataset.idx = index;
                document.getElementById('edit-modal').classList.remove('hidden');
            });
            iconsDiv.appendChild(btnEdit);

            // View Prompt (Only for latest assistant message)
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

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
        document.getElementById('btn-jump-bottom').classList.add('hidden');
    }

    async autoSave() {
        // Use a generic name if none exists (in a full app, prompt for name)
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
            this.state.clear(); // Empty slot
        }
        this.renderAll();
    }
}