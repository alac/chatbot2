export class AppSettings {
    constructor() {
        this.apiUrl = 'https://api.openai.com/v1';
        this.useChatCompletions = true;
        this.apiKey = '';
        this.model = 'gpt-3.5-turbo';
        this.favoriteModels = []; 
        
        this.systemPrompt = "You are a helpful AI assistant.";
        this.forceThink = false;
        this.anoteContent = "";
        this.anoteUnit = "message"; // 'message' or 'sentence'
        this.anoteDepth = 0;
        
        this.contextLength = 4096;
        this.maxTokens = 512;
        this.temperature = 1.0;
        this.minP = 0.0;
        this.topP = 1.0;
        this.topK = 0;
        this.topA = 0.0;
        this.typical = 1.0;
        this.tfs = 1.0;
        this.repPen = 1.0;
        
        this.load();
    }

    load() {
        const saved = localStorage.getItem('ai_proto_settings');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
            if (!Array.isArray(this.favoriteModels)) this.favoriteModels = [];
        }
    }

    save() {
        localStorage.setItem('ai_proto_settings', JSON.stringify(this));
    }

    neutralizeSamplers() {
        this.temperature = 1.0;
        this.minP = 0.0;
        this.topP = 1.0;
        this.topK = 0;
        this.topA = 0.0;
        this.typical = 1.0;
        this.tfs = 1.0;
        this.repPen = 1.0;
    }
}

export const settings = new AppSettings();

export class StoryState {
    constructor() {
        this.history = []; // Array of { role, content, reasoning, meta: { model, duration } }
        this.mode = 'chat';
        this.lastRawPayload = null; 
    }

    // ADDED: This fixes the "this.state.clear is not a function" error
    clear() {
        this.history = [];
        this.lastRawPayload = null;
    }

    addTurn(role, content, reasoning = '', meta = {}) {
        this.history.push({ role, content, reasoning, meta });
    }

    updateLastTurn(content, reasoning = '') {
        if (this.history.length > 0) {
            this.history[this.history.length - 1].content = content;
            this.history[this.history.length - 1].reasoning = reasoning;
        }
    }

    deleteTurn(index) {
        if (index >= 0 && index < this.history.length) {
            this.history.splice(index, 1);
        }
    }

    editTurn(index, newContent) {
        if (index >= 0 && index < this.history.length) {
            this.history[index].content = newContent;
        }
    }

    buildPromptPayload() {
        const messages = JSON.parse(JSON.stringify(this.history));
        
        if (settings.systemPrompt.trim() !== "") {
            messages.unshift({ role: "system", content: settings.systemPrompt.trim() });
        }

        const anote = settings.anoteContent.trim();
        if (anote !== "") {
            const depth = parseInt(settings.anoteDepth, 10);
            
            if (settings.anoteUnit === "message") {
                const insertIndex = Math.max(0, messages.length - depth);
                messages.splice(insertIndex, 0, { role: "system", content: `[Author's Note: ${anote}]` });
            } 
            else if (settings.anoteUnit === "sentence") {
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].role === 'user') {
                        let text = messages[i].content;
                        const sentenceRegex = /(?<=[.!?\n])\s+/;
                        let sentences = text.split(sentenceRegex);
                        if (sentences.length === 1) sentences = [text]; 
                        
                        const targetIdx = Math.max(0, sentences.length - depth);
                        sentences.splice(targetIdx, 0, `\n[Author's Note: ${anote}]\n`);
                        
                        messages[i].content = sentences.join(' ').trim();
                        break;
                    }
                }
            }
        }

        messages.forEach(m => {
            delete m.meta;
            delete m.reasoning;
        });

        if (settings.forceThink) {
            messages.push({ role: 'assistant', content: '<think>\n' });
        }

        return messages;
    }

    loadFromData(data) {
        this.history = data.history || [];
        this.mode = data.mode || 'chat';
    }

    exportData() {
        return {
            history: this.history,
            mode: this.mode
        };
    }
}