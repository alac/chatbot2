import { settings } from './AppSettings.js';

export class StoryState {
    constructor() {
        this.history = []; 
        this.redoStack = []; // Stores popped messages
        this.mode = 'chat';
        this.lastRawPayload = null; 
    }

    clear() {
        this.history = [];
        this.redoStack = [];
        this.lastRawPayload = null;
    }

    addTurn(role, content, reasoning = '', meta = {}) {
        this.history.push({ 
            role, 
            isBatch: false, 
            activeDraftIndex: 0, 
            drafts: [{ model: meta.model || '', content, reasoning, status: 'done', duration: meta.duration || 0 }]
        });
        this.redoStack = []; // Clear redo on new action
        this.trimOldDrafts();
    }

    addBatchTurn(count) {
        const drafts = [];
        for(let i=0; i<count; i++) {
            drafts.push({ model: '', content: '', reasoning: '', status: 'streaming', duration: 0 });
        }
        this.history.push({
            role: 'assistant',
            isBatch: true,
            activeDraftIndex: 0,
            drafts: drafts
        });
        this.redoStack = []; // Clear redo on new action
        this.trimOldDrafts();
    }

    // --- UNDO / REDO ---
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
            this.redoStack = []; // Clear redo on manual edit
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

    buildPromptPayload() {
        const messages = [];
        
        if (settings.systemPrompt.trim() !== "") {
            messages.push({ role: "system", content: settings.systemPrompt.trim() });
        }

        for (let i = 0; i < this.history.length; i++) {
            messages.push({ role: this.history[i].role, content: this.getContent(i) });
        }

        const anote = settings.anoteContent.trim();
        if (anote !== "") {
            const formattedAnote = settings.anoteTemplate.replace('<|>', anote);
            const depth = parseInt(settings.anoteDepth, 10);

            if (settings.anoteUnit === "message") {
                const insertIndex = Math.max(0, messages.length - depth);
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

        if (settings.forceThink) {
            messages.push({ role: 'assistant', content: '<think>\n' });
        }

        return messages;
    }

    loadFromData(data) {
        this.history = data.history || [];
        this.redoStack = data.redoStack || [];
        this.mode = data.mode || 'chat';
    }

    exportData() {
        return { history: this.history, redoStack: this.redoStack, mode: this.mode };
    }
}