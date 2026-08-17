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
            { enabled: false, model: '' }, { enabled: false, model: '' },
            { enabled: false, model: '' }, { enabled: false, model: '' }
        ];

        this.choiceParallelEnabled = false;
        this.choiceParallelCount = 2;
        this.choiceParallelOverrides = [
            { enabled: false, model: '' }, { enabled: false, model: '' },
            { enabled: false, model: '' }, { enabled: false, model: '' }
        ];

        this.forceThink = false;
        this.quickReplies = "::Continue\nContinue the story.\n\n::Describe\nDescribe the surroundings in more detail.";
        this.qrModels = {};

        this.choicesPrompts = "::Plain\nSuggest 5 possible actions the user character could take next. Wrap each option in <choice> and </choice> tags.\n\n::Character Driven\nSuggest 5 possible actions the user character could take next based on their current state of mind and emotions. Wrap each option in <choice> and </choice> tags.\n\n::Context Driven\nSuggest 5 possible actions the user character could take next based on their various abilities, and what is afforded by the situation/location they are in. Wrap each option in <choice> and </choice> tags.\n\n::Dialogue Focused\nSuggest 5 different things the user character could say next, ranging from friendly to hostile. Wrap each option in <choice> and </choice> tags.\n\n::Unexpected Events\nSuggest 3 surprising, impulsive, or chaotic actions the user character could take to completely derail the current situation. Wrap each option in <choice> and </choice> tags.";
        this.activeChoicePromptTitle = "Plain";
        this.activeChoicePromptText = "Suggest 5 possible actions the user character could take next. Wrap each option in <choice> and </choice> tags.";

        this.trackSummary = true;
        this.summarizeModel = '';
        this.autoSummarizePrompts = "::Event Log\nSummarize the provided unsummarized events. Extract all key character actions, plot points, and dialogue beats. Format as a concise bulleted list.\n\n::Story Synopsis\nWrite a prose summary of the recent events, continuing smoothly from the previous summary.";

        // Samplers
        this.contextLength = 4096;
        this.charsPerToken = 4.0;
        this.maxTokens = 512;
        this.temperature = 1.0;
        this.minP = 0.0;
        this.topP = 1.0;
        this.topK = 0;
        this.topA = 0.0;
        this.typical = 1.0;
        this.tfs = 1.0;
        this.repPen = 1.0;
        this.stopSequences = "";

        // UX
        this.displayMode = 'chat';
        this.theme = 'kobold';
        this.renderMarkdown = true;
        this.visibleOutOfContext = 5;
        this.regexes = []; 
        
        // Tools Menu Global Persistence
        this.diceNotation = "1d20";

        // GitHub Sync State
        this.githubPAT = '';
        this.encryptionKey = '';
        this.gistMapping = {};

        this.lastEdited = 0;
        this.load();
    }

    load() {
        const saved = localStorage.getItem('ai_proto_settings');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
            if (!Array.isArray(this.favoriteModels)) this.favoriteModels = [];
            if (!Array.isArray(this.parallelOverrides)) this.parallelOverrides = [{enabled:false, model:''},{enabled:false, model:''},{enabled:false, model:''},{enabled:false, model:''}];
            if (!Array.isArray(this.choiceParallelOverrides)) this.choiceParallelOverrides = [{enabled:false, model:''},{enabled:false, model:''},{enabled:false, model:''},{enabled:false, model:''}];
            if (!this.quickReplies) this.quickReplies = "::Continue\nContinue the story.\n\n::Describe\nDescribe the surroundings in more detail.";
            if (!this.qrModels) this.qrModels = {};
            if (!Array.isArray(this.regexes)) this.regexes = [];
            if (!this.charsPerToken) this.charsPerToken = 4.0;
            if (this.visibleOutOfContext === undefined) this.visibleOutOfContext = 5;
            if (!this.autoSummarizePrompts) this.autoSummarizePrompts = "::Event Log\nSummarize the provided unsummarized events. Extract all key character actions, plot points, and dialogue beats. Format as a concise bulleted list.\n\n::Story Synopsis\nWrite a prose summary of the recent events, continuing smoothly from the previous summary.";
            
            if (!this.choicesPrompts) {
                this.choicesPrompts = "::Plain\nSuggest 5 possible actions the user character could take next. Wrap each option in <choice> and </choice> tags.\n\n::Character Driven\nSuggest 5 possible actions the user character could take next based on their current state of mind and emotions. Wrap each option in <choice> and </choice> tags.\n\n::Context Driven\nSuggest 5 possible actions the user character could take next based on their various abilities, and what is afforded by the situation/location they are in. Wrap each option in <choice> and </choice> tags.\n\n::Dialogue Focused\nSuggest 5 different things the user character could say next, ranging from friendly to hostile. Wrap each option in <choice> and </choice> tags.\n\n::Unexpected Events\nSuggest 3 surprising, impulsive, or chaotic actions the user character could take to completely derail the current situation. Wrap each option in <choice> and </choice> tags.";
                this.activeChoicePromptTitle = "Plain";
                this.activeChoicePromptText = "Suggest 5 possible actions the user character could take next. Wrap each option in <choice> and </choice> tags.";
            }

            if (!this.diceNotation) this.diceNotation = "1d20";
            if (!this.gistMapping) this.gistMapping = {};
            if (!this.lastEdited) this.lastEdited = Date.now();
        } else {
            this.lastEdited = Date.now();
        }
    }

    save() {
        this.lastEdited = Date.now();
        localStorage.setItem('ai_proto_settings', JSON.stringify(this));
    }

    // Includes all auth keys (useful for manual local export/import across devices)
    exportSettings() {
        return JSON.parse(JSON.stringify(this));
    }

    // Strips out sensitive/host-specific data for Cloud Syncing
    getCloudSyncPayload() {
        const payload = this.exportSettings();
        delete payload.githubPAT;
        delete payload.encryptionKey;
        delete payload.gistMapping;
        return payload;
    }

    importSettings(data) {
        Object.assign(this, data);
        if (!this.gistMapping) this.gistMapping = {};
        this.save();
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

    applyRegexes(text, type) {
        if (!text) return text;
        let res = text;
        this.regexes.forEach(rx => {
            if ((type === 'outgoing' && rx.applyOutgoing) || (type === 'visually' && rx.applyVisually)) {
                if (rx.pattern) {
                    try {
                        let r;
                        const match = rx.pattern.match(/^\/(.+)\/([a-z]*)$/i);
                        if (match) {
                            r = new RegExp(match[1], match[2] || 'g');
                        } else {
                            r = new RegExp(rx.pattern, 'g');
                        }
                        res = res.replace(r, rx.replacement);
                    } catch (e) {}
                }
            }
        });
        return res;
    }
}

export const settings = new AppSettings();