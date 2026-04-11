export class AppSettings {
    constructor() {
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        this.apiKey = '';
        this.model = 'gpt-3.5-turbo';
        this.temperature = 0.7;
        this.maxTokens = 512;
        this.systemPrompt = "You are a helpful AI assistant.";
        
        this.load();
    }

    load() {
        const saved = localStorage.getItem('ai_prototype_settings');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
        }
    }

    save() {
        localStorage.setItem('ai_prototype_settings', JSON.stringify(this));
    }
}

// Export a singleton instance
export const settings = new AppSettings();