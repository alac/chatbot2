import { StoryState } from '../state/StoryState.js';
import { GenerationJob } from '../api/OpenAIClient.js';

export class UIManager {
    constructor() {
        this.state = new StoryState();
        this.currentJob = null;
        
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

        if (text) {
            this.state.addTurn('user', text);
            this.appendTurnToDOM('user', text);
            this.input.value = '';
        }

        this.btnSend.classList.add('hidden');
        this.btnAbort.classList.remove('hidden');

        const messages = this.state.buildPromptPayload();
        this.currentJob = new GenerationJob();
        
        this.state.addTurn('assistant', '');
        
        const bubbleEl = this.appendTurnToDOM('assistant', '');
        const textNode = document.createTextNode('');
        const cursor = document.createElement('span');
        cursor.className = 'streaming-indicator';
        
        bubbleEl.appendChild(textNode);
        bubbleEl.appendChild(cursor);
        this.scrollToBottom();

        try {
            for await (const token of this.currentJob.streamGeneration(messages)) {
                textNode.textContent += token;
                this.scrollToBottom();
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.error(error);
                textNode.textContent += `\n[Error: ${error.message}]`;
            }
        } finally {
            cursor.remove();
            this.state.history[this.state.history.length - 1].content = this.currentJob.accumulatedText;
            
            this.currentJob = null;
            this.btnAbort.classList.add('hidden');
            this.btnSend.classList.remove('hidden');
            this.input.focus();
        }
    }

    handleAbort() {
        if (this.currentJob) this.currentJob.cancel();
    }

    appendTurnToDOM(role, text) {
        const div = document.createElement('div');
        div.className = `turn ${role}`;
        div.textContent = text; // textContent properly respects white-space: pre-wrap
        this.container.appendChild(div);
        return div;
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }
}