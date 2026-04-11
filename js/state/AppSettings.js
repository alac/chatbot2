export class AppSettings {
    constructor() {
        this.apiUrl = 'https://api.openai.com/v1';
        this.useChatCompletions = true;
        this.apiKey = '';
        this.model = 'gpt-3.5-turbo';
        this.favoriteModels = ['gpt-3.5-turbo', 'gpt-4o']; // Default favorites
        
        this.systemPrompt = "You are a helpful AI assistant.";
        this.anoteContent = "";
        this.anoteUnit = "message"; // 'message' or 'sentence'
        this.anoteDepth = 0;
        
        // Context & Response
        this.contextLength = 4096;
        this.maxTokens = 512;

        // Samplers
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
        const saved = localStorage.getItem('ai_prototype_settings');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
            // Ensure favoriteModels is always an array
            if (!Array.isArray(this.favoriteModels)) this.favoriteModels = [];
        }
    }

    save() {
        localStorage.setItem('ai_prototype_settings', JSON.stringify(this));
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