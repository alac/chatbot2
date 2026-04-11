import { StoryState } from '../state/StoryState.js';
import { GenerationJob } from '../api/OpenAIClient.js';

export class UIManager {
    constructor() {
        this.state = new StoryState();
        this.currentJob = null;
        
        // DOM Elements
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');
        this.btnSend = document.getElementById('btn-send');
        this.btnAbort = document.getElementById('btn-abort');
        this.modeSelector = document.getElementById('mode-selector');

        this.bindEvents();
    }

    bindEvents() {
        this.btnSend.addEventListener('click', () => this.handleSend());
        this.btnAbort.addEventListener('click', () => this.handleAbort());
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.modeSelector.addEventListener('change', (e) => {
            this.state.mode = e.target.value;
            this.container.className = `${this.state.mode}-mode`;
        });
    }

    async handleSend() {
        const text = this.input.value.trim();
        if (!text && this.state.history.length === 0) return;

        // 1. Add User Input to State and render it
        if (text) {
            this.state.addTurn('user', text);
            this.appendTurnToDOM('user', text);
            this.input.value = '';
        }

        // 2. Prepare for AI generation
        this.btnSend.classList.add('hidden');
        this.btnAbort.classList.remove('hidden');

        const messages = this.state.buildPromptPayload();
        this.currentJob = new GenerationJob();
        
        // Add an empty turn in state for the assistant
        this.state.addTurn('assistant', '');
        
        // Create the UI element we will stream into
        const bubbleEl = this.appendTurnToDOM('assistant', '');
        const textNode = document.createTextNode('');
        const cursor = document.createElement('span');
        cursor.className = 'streaming-indicator';
        
        bubbleEl.appendChild(textNode);
        bubbleEl.appendChild(cursor);
        this.scrollToBottom();

        try {
            // 3. Stream the response
            for await (const token of this.currentJob.streamChatCompletions(messages)) {
                textNode.textContent += token;
                this.scrollToBottom();
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.error(error);
                textNode.textContent += `\n[Error: ${error.message}]`;
            }
        } finally {
            // 4. Cleanup
            cursor.remove();
            // Sync the final accumulated text back to the state
            this.state.history[this.state.history.length - 1].content = this.currentJob.accumulatedText;
            
            this.currentJob = null;
            this.btnAbort.classList.add('hidden');
            this.btnSend.classList.remove('hidden');
            this.input.focus();
        }
    }

    handleAbort() {
        if (this.currentJob) {
            this.currentJob.cancel();
        }
    }

    appendTurnToDOM(role, text) {
        const div = document.createElement('div');
        div.className = `turn ${role}`;
        div.textContent = text;
        this.container.appendChild(div);
        return div;
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }
}