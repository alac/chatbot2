import { settings } from './AppSettings.js';

export class StoryState {
    constructor() {
        this.history = []; 
        this.redoStack = []; 
        this.lastRawPayload = null; 
        this.contextBoundaryIndex = -1;

        // Summary State
        this.summary = "";
        this.selectedAutoSumPromptTitle = "Event Log";
        this.selectedAutoSumPromptText = "Summarize the provided unsummarized events. Extract all key character actions, plot points, and dialogue beats. Format as a concise bulleted list.";
    }

    clear() {
        this.history = [];
        this.redoStack = [];
        this.lastRawPayload = null;
        this.contextBoundaryIndex = -1;
        this.summary = "";
    }

    addTurn(role, content, reasoning = '', meta = {}) {
        this.history.push({ 
            role, 
            isBatch: false, 
            activeDraftIndex: 0,
            wasSummarized: false,
            drafts: [{ model: meta.model || '', content, reasoning, status: 'done', duration: meta.duration || 0, markdownOverride: null, usage: null }]
        });
        this.redoStack = []; 
        this.trimOldDrafts();
    }

    addBatchTurn(count) {
        const drafts = [];
        for(let i=0; i<count; i++) {
            drafts.push({ model: '', content: '', reasoning: '', status: 'streaming', duration: 0, markdownOverride: null, usage: null });
        }
        this.history.push({
            role: 'assistant',
            isBatch: true,
            activeDraftIndex: 0,
            wasSummarized: false,
            drafts: drafts
        });
        this.redoStack = []; 
        this.trimOldDrafts();
    }

    undo() {
        if (this.history.length > 0) {
            this.redoStack.push(this.history.pop());
            return true;
        }
        return false;
    }

    redo() {
        if (this.redoStack.length > 0) {
            this.history.push(this.redoStack.pop());
            return true;
        }
        return false;
    }

    updateBatchDraft(msgIndex, draftIndex, data) {
        if (this.history[msgIndex] && this.history[msgIndex].drafts[draftIndex]) {
            Object.assign(this.history[msgIndex].drafts[draftIndex], data);
        }
    }

    setActiveDraft(msgIndex, draftIndex) {
        if (this.history[msgIndex] && this.history[msgIndex].isBatch) {
            this.history[msgIndex].activeDraftIndex = draftIndex;
        }
    }

    getContent(index) {
        const msg = this.history[index];
        if (!msg || !msg.drafts[msg.activeDraftIndex]) return "";
        return msg.drafts[msg.activeDraftIndex].content;
    }

    getReasoning(index) {
        const msg = this.history[index];
        if (!msg || !msg.drafts[msg.activeDraftIndex]) return "";
        return msg.drafts[msg.activeDraftIndex].reasoning;
    }

    deleteTurn(index) {
        if (index >= 0 && index < this.history.length) this.history.splice(index, 1);
    }

    editTurn(index, newContent) {
        if (index >= 0 && index < this.history.length) {
            const msg = this.history[index];
            msg.drafts[msg.activeDraftIndex].content = newContent;
            msg.isBatch = false; 
            this.redoStack = []; 
        }
    }

    trimOldDrafts(keepCount = 4) {
        if (this.history.length <= keepCount) return;
        const cutoffIdx = this.history.length - keepCount;

        for (let i = 0; i < cutoffIdx; i++) {
            const msg = this.history[i];
            if (msg.isBatch) {
                const activeDraft = msg.drafts[msg.activeDraftIndex];
                msg.isBatch = false;
                msg.activeDraftIndex = 0;
                msg.drafts = [activeDraft]; 
            }
        }
    }

    buildPromptPayload(isSummarizing = false, summarizePromptText = "") {
        const messages = [];
        const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
        
        let sysAnoteString = settings.systemPrompt.trim();
        
        if (!isSummarizing && settings.anoteUnit === "message" && settings.anoteContent.trim()) {
            sysAnoteString += "\n" + settings.anoteTemplate.replace('<|>', settings.anoteContent.trim());
        }

        let sumLength = 0;
        if (this.summary.trim()) {
            sumLength = Math.ceil((this.summary.trim().length + 20) / charsRatio);
        }

        let summarizerPromptTokens = 0;
        if (isSummarizing) {
            summarizerPromptTokens = Math.ceil(summarizePromptText.length / charsRatio);
        }

        let unchangingTokens = Math.ceil(sysAnoteString.length / charsRatio) + parseInt(settings.maxTokens) + sumLength + summarizerPromptTokens;
        let budget = parseInt(settings.contextLength) - unchangingTokens;

        this.contextBoundaryIndex = -1;
        let includedHistoryMsgs = [];
        let includedIndices = [];

        for (let i = this.history.length - 1; i >= 0; i--) {
            let msgContent = this.getContent(i);
            msgContent = settings.applyRegexes(msgContent, 'outgoing');
            
            let T = Math.ceil(msgContent.length / charsRatio); 
            if (budget - T >= 0) {
                budget -= T;
                includedHistoryMsgs.unshift({ role: this.history[i].role, content: msgContent });
                includedIndices.unshift(i);
            } else {
                this.contextBoundaryIndex = i; 
                break;
            }
        }

        if (settings.systemPrompt.trim() !== "") {
            messages.push({ role: "system", content: settings.systemPrompt.trim() });
        }

        if (this.summary.trim()) {
            messages.push({ role: "system", content: `<summary>\n${this.summary.trim()}\n</summary>` });
        }

        includedHistoryMsgs.forEach(m => messages.push(m));

        if (!isSummarizing) {
            const anote = settings.anoteContent.trim();
            if (anote !== "") {
                const formattedAnote = settings.anoteTemplate.replace('<|>', anote);
                const depth = parseInt(settings.anoteDepth, 10);

                if (settings.anoteUnit === "message") {
                    const insertIndex = Math.max((this.summary.trim() ? 2 : 1), messages.length - depth);
                    messages.splice(insertIndex, 0, { role: "system", content: formattedAnote });
                } 
                else if (settings.anoteUnit === "sentence") {
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i].role === 'user') {
                            let text = messages[i].content;
                            const sentenceRegex = /(?<=[.!?\n])\s+/;
                            let sentences = text.split(sentenceRegex);
                            if (sentences.length === 1) sentences = [text]; 
                            
                            const targetIdx = Math.max(0, sentences.length - depth);
                            sentences.splice(targetIdx, 0, `\n${formattedAnote}\n`);
                            messages[i].content = sentences.join(' ').trim();
                            break;
                        }
                    }
                }
            }
        }

        if (isSummarizing) {
            messages.push({ role: "user", content: summarizePromptText });
        } else {
            if (settings.forceThink) {
                messages.push({ role: 'assistant', content: '<think>\n' });
            }
        }

        return { messages, includedIndices };
    }

    loadFromData(data) {
        this.history = data.history || [];
        this.history.forEach(m => { if(m.wasSummarized === undefined) m.wasSummarized = false; });
        this.redoStack = data.redoStack || [];
        this.contextBoundaryIndex = data.contextBoundaryIndex !== undefined ? data.contextBoundaryIndex : -1;
        this.summary = data.summary || "";
        this.selectedAutoSumPromptTitle = data.selectedAutoSumPromptTitle || "Event Log";
        this.selectedAutoSumPromptText = data.selectedAutoSumPromptText || "Summarize the provided unsummarized events. Extract all key character actions, plot points, and dialogue beats. Format as a concise bulleted list.";
    }

    exportData() {
        return { 
            history: this.history, 
            redoStack: this.redoStack, 
            contextBoundaryIndex: this.contextBoundaryIndex,
            summary: this.summary,
            selectedAutoSumPromptTitle: this.selectedAutoSumPromptTitle,
            selectedAutoSumPromptText: this.selectedAutoSumPromptText
        };
    }
}