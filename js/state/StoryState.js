import { settings } from './AppSettings.js';

export class StoryState {
    constructor() {
        // History is an array of { role: 'user'|'assistant', content: string }
        this.history = [];
        this.mode = 'chat'; // 'chat' or 'story'
    }

    addTurn(role, content) {
        this.history.push({ role, content });
    }

    // Appends to the last assistant turn (used when streaming completes)
    appendLastTurn(content) {
        if (this.history.length > 0) {
            this.history[this.history.length - 1].content += content;
        }
    }

    // Compiles the messages array for the OpenAI API
    buildPromptPayload() {
        const messages = [];
        
        // 1. Inject System Prompt
        if (settings.systemPrompt.trim() !== "") {
            messages.push({ role: "system", content: settings.systemPrompt });
        }

        // 2. Inject History 
        // (In a full version, we'd do token estimation and truncation here)
        for (const turn of this.history) {
            messages.push(turn);
        }

        return messages;
    }

    clear() {
        this.history = [];
    }
}