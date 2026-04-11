import { settings } from './AppSettings.js';

export class StoryState {
    constructor() {
        this.history = [];
        this.mode = 'chat';
    }

    addTurn(role, content) {
        this.history.push({ role, content });
    }

    // Modifies a cloned history array to inject the Author's Note dynamically
    buildPromptPayload() {
        // Deep copy so we don't permanently modify the visible history
        const messages = JSON.parse(JSON.stringify(this.history));
        
        if (settings.systemPrompt.trim() !== "") {
            messages.unshift({ role: "system", content: settings.systemPrompt.trim() });
        }

        const anote = settings.anoteContent.trim();
        if (anote !== "") {
            const depth = parseInt(settings.anoteDepth, 10);
            
            if (settings.anoteUnit === "message") {
                // Insert as a system message N messages from the end
                const insertIndex = Math.max(0, messages.length - depth);
                messages.splice(insertIndex, 0, { 
                    role: "system", 
                    content: `[Author's Note: ${anote}]` 
                });
            } 
            else if (settings.anoteUnit === "sentence") {
                // Find the last user message
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].role === 'user') {
                        let text = messages[i].content;
                        // Regex to split by sentence-ending punctuation followed by whitespace/newlines
                        const sentenceRegex = /(?<=[.!?\n])\s+/;
                        let sentences = text.split(sentenceRegex);
                        
                        // Fallback if the browser doesn't support lookbehinds or string doesn't split well
                        if (sentences.length === 1) sentences = [text]; 
                        
                        const targetIdx = Math.max(0, sentences.length - depth);
                        sentences.splice(targetIdx, 0, `\n[Author's Note: ${anote}]\n`);
                        
                        messages[i].content = sentences.join(' ').trim();
                        break;
                    }
                }
            }
        }

        return messages;
    }

    clear() {
        this.history = [];
    }
}