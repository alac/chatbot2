export class AppSettings {
    constructor() {
        this.apiUrl = 'https://api.openai.com/v1';
        this.useChatCompletions = true;
        this.apiKey = '';
        this.model = 'gpt-3.5-turbo';
        this.favoriteModels = []; 
        
        // Batch / Parallel
        this.parallelEnabled = false;
        this.parallelCount = 2;
        this.parallelOverrides = [
            { enabled: false, model: '' },
            { enabled: false, model: '' },
            { enabled: false, model: '' },
            { enabled: false, model: '' }
        ];

        this.systemPrompt = "You are a helpful AI assistant.";
        this.forceThink = false;
        
        // A/N
        this.anoteTemplate = "[Author's note: <|>]";
        this.anoteContent = "";
        this.anoteUnit = "message"; 
        this.anoteDepth = 0;
        
        // Quick Replies
        this.quickReplies = "::Continue\nContinue the story.\n\n::Describe\nDescribe the surroundings in more detail.";

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
            if (!Array.isArray(this.parallelOverrides)) this.parallelOverrides = [{enabled:false, model:''},{enabled:false, model:''},{enabled:false, model:''},{enabled:false, model:''}];
            if (!this.anoteTemplate) this.anoteTemplate = "[Author's note: <|>]";
            if (!this.quickReplies) this.quickReplies = "::Continue\nContinue the story.\n\n::Describe\nDescribe the surroundings in more detail.";
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