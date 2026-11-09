// BEGIN FILE: js/services/GenerationCoordinator.js
import { settings } from '../state/AppSettings.js';
import { ParallelGenerationBatch } from '../api/OpenAIClient.js';
import { TextRenderer } from '../ui/TextRenderer.js';

export class GenerationCoordinator {
    constructor(app) {
        this.app = app;
    }

    handleRetry() {
        if (this.app.state.history.length === 0) return;
        const lastIdx = this.app.state.history.length - 1;
        const last = this.app.state.history[lastIdx];
        if (last.role === 'assistant') {
            this.app.state.markDraftsAsStale(lastIdx);
            this.app.turnRenderer.renderAll();
            this.handleSend(true, lastIdx);
        }
    }

    handleAbort() {
        if (this.app.activeBatch) this.app.activeBatch.cancelAll();
    }

    async handleSend(isRetry = false, targetIndex = null) {
        if (this.app.activeBatch) return;

        const text = this.app.input.value.trim();
        if (!isRetry) {
            if (!text && this.app.state.history.length === 0) return;
            if (text) {
                this.app.state.addTurn('user', text);
                this.app.input.value = '';
                this.app.input.style.height = 'auto';
                this.app.turnRenderer.renderAll(); 
            }
        }

        this.app.draftSwitcher.clearOffsets();

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.app.isUserScrolledUp = false;
        this.app.requestTracker.startTask();

        let tempMsg = null;
        if (targetIndex !== null) {
            tempMsg = this.app.state.history.pop();
        }
        
        const payloadObj = this.app.state.buildPromptPayload();
        
        if (tempMsg) {
            this.app.state.history.push(tempMsg);
        }
        
        let originalModel = settings.model;
        let originalEnabled = settings.parallelEnabled;
        let originalCount = settings.parallelCount;
        let originalOverrides = settings.parallelOverrides;

        let count = settings.parallelEnabled ? parseInt(settings.parallelCount) : 1;
        
        if (this.app.overrideNextSend) {
            settings.model = this.app.overrideNextSend.draft1Model || originalModel;
            settings.parallelEnabled = true;
            settings.parallelCount = this.app.overrideNextSend.count || 1;
            settings.parallelOverrides = this.app.overrideNextSend.overrides || [];
            count = settings.parallelCount;
        }

        this.app.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, settings.parallelOverrides);
        
        if (this.app.overrideNextSend) {
            settings.model = originalModel;
            settings.parallelEnabled = originalEnabled;
            settings.parallelCount = originalCount;
            settings.parallelOverrides = originalOverrides;
            this.app.overrideNextSend = null;
        }
        
        const newIdx = targetIndex !== null ? targetIndex : this.app.state.history.length;
        let draftOffset = 0;

        if (targetIndex !== null) {
            draftOffset = this.app.state.history[newIdx].drafts.length;
            this.app.state.appendBatchDrafts(newIdx, count);
            this.app.state.setActiveDraft(newIdx, draftOffset);
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
        } else {
            this.app.state.addBatchTurn(count, 'assistant');
        }

        this.app.turnRenderer.appendTurnToDOM('assistant', newIdx);
        this.app.draftSwitcher.renderSwitcher(newIdx, true);
        
        if (this.app.batchTimerInterval) clearInterval(this.app.batchTimerInterval);
        this.app.batchStartTime = Date.now();
        this.app.batchTimerInterval = setInterval(() => {
            if (!this.app.activeBatch || this.app.activeBatch.isFinished) {
                clearInterval(this.app.batchTimerInterval);
                return;
            }
            
            if (this.app.draftSwitcher.activeMsgIndex === newIdx) {
                const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
                
                this.app.activeBatch.jobs.forEach((job, i) => {
                    if (job.status === 'streaming') {
                        const actualDraftIdx = i + draftOffset;
                        const timerEl = document.getElementById(`tb-timer-${actualDraftIdx}`);
                        if (timerEl) {
                            const draftData = this.app.state.history[newIdx].drafts[actualDraftIdx];
                            const totalChars = (draftData.content?.length || 0) + (draftData.reasoning?.length || 0);
                            const estTokens = Math.ceil(totalChars / charsRatio);
                            timerEl.textContent = `(~${estTokens}t)`;
                        }
                    }
                });
            }
        }, 100);

        this.app.autoSave();

        try {
            await this.app.activeBatch.startAll((draftIdx, data) => {
                const actualDraftIdx = draftIdx + draftOffset;
                this.app.state.updateBatchDraft(newIdx, actualDraftIdx, data);
                
                if (this.app.state.history[newIdx].activeDraftIndex === actualDraftIdx) {
                    const contentNode = document.getElementById(`content-${newIdx}`);
                    const reasonNode = document.getElementById(`reasoning-${newIdx}`);
                    const reasonDiv = document.getElementById(`reasoning-block-${newIdx}`);
                    
                    if (data.reasoning) {
                        let wasAtBottom = true;
                        if (reasonDiv && !reasonDiv.classList.contains('hidden')) {
                            wasAtBottom = Math.abs(reasonDiv.scrollHeight - reasonDiv.scrollTop - reasonDiv.clientHeight) < 30;
                        }
                        
                        if (reasonNode) reasonNode.textContent = data.reasoning;
                        
                        if (reasonDiv) {
                            reasonDiv.classList.remove('hidden');
                            if (data.status === 'streaming' && wasAtBottom) {
                                reasonDiv.scrollTop = reasonDiv.scrollHeight;
                            }
                        }
                    }
                    if (contentNode) {
                        const draftObj = this.app.state.history[newIdx].drafts[actualDraftIdx];
                        const isHighlight = newIdx >= this.app.state.history.length - settings.highlightTurnCount;
                        TextRenderer.setNodeContent(contentNode, data.content, draftObj, isHighlight);
                    }
                    
                    if (!this.app.isUserScrolledUp) this.app.turnRenderer.scrollToBottom();
                }

                if (this.app.draftSwitcher.activeMsgIndex === newIdx) {
                    const iconMap = { 'done':'✔️', 'error':'❌', 'streaming':'🕒' };
                    const iconEl = document.getElementById(`tb-draft-icon-${actualDraftIdx}`);
                    if (iconEl) iconEl.textContent = iconMap[data.status] || '';
                    
                    if (data.status !== 'streaming') {
                        const timerEl = document.getElementById(`tb-timer-${actualDraftIdx}`);
                        if (timerEl) timerEl.textContent = `(${data.duration}s)`;
                    }
                }
            });
        } finally {
            if (this.app.batchTimerInterval) clearInterval(this.app.batchTimerInterval);
            if (this.app.activeBatch && this.app.activeBatch.jobs[0]) {
                this.app.state.lastRawPayload = this.app.activeBatch.jobs[0].rawPayload;
            }
            this.app.activeBatch = null;
            
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            
            let tempMsgFinal = null;
            if (targetIndex !== null) tempMsgFinal = this.app.state.history.pop();
            this.app.state.buildPromptPayload();
            if (tempMsgFinal) this.app.state.history.push(tempMsgFinal);

            this.app.turnRenderer.appendTurnToDOM('assistant', newIdx);
            if (this.app.draftSwitcher.activeMsgIndex === newIdx) {
                this.app.draftSwitcher.renderSwitcher(newIdx, false);
            }
            
            this.app.summaryManager.updateSummaryMeter();
            this.app.nanoGPTUsage.update();
            if (!this.app.isUserScrolledUp) this.app.turnRenderer.scrollToBottom();
            this.app.requestTracker.endTask();
            this.app.autoSave();
        }
    }

    async generateAdditionalDrafts(msgIndex, modelList) {
        if (this.app.activeBatch) return;

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.app.requestTracker.startTask();

        const popped = this.app.state.history.splice(msgIndex + 1);
        const targetMsg = this.app.state.history.pop(); 
        
        const payloadObj = this.app.state.buildPromptPayload();
        
        this.app.state.history.push(targetMsg);
        this.app.state.history.push(...popped);

        const count = modelList.length;
        const originalModel = settings.model;
        settings.model = modelList[0];
        const overrides = modelList.slice(1).map(m => ({ enabled: true, model: m }));
        
        this.app.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, overrides);
        settings.model = originalModel;

        const draftOffset = targetMsg.drafts.length;
        targetMsg.isBatch = true;
        this.app.state.appendBatchDrafts(msgIndex, count);
        for (let i = 0; i < count; i++) targetMsg.drafts[draftOffset + i].model = modelList[i];
        this.app.state.setActiveDraft(msgIndex, draftOffset);

        this.app.draftSwitcher.renderSwitcher(msgIndex, true);
        this.app.draftSwitcher.switchDraftExplicit(msgIndex, draftOffset);

        if (this.app.batchTimerInterval) clearInterval(this.app.batchTimerInterval);
        this.app.batchStartTime = Date.now();
        this.app.batchTimerInterval = setInterval(() => {
            if (!this.app.activeBatch || this.app.activeBatch.isFinished) {
                clearInterval(this.app.batchTimerInterval);
                return;
            }
            if (this.app.draftSwitcher.activeMsgIndex === msgIndex) {
                const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
                this.app.activeBatch.jobs.forEach((job, i) => {
                    if (job.status === 'streaming') {
                        const actualDraftIdx = i + draftOffset;
                        const timerEl = document.getElementById(`tb-timer-${actualDraftIdx}`);
                        if (timerEl) {
                            const draftData = this.app.state.history[msgIndex].drafts[actualDraftIdx];
                            const totalChars = (draftData.content?.length || 0) + (draftData.reasoning?.length || 0);
                            timerEl.textContent = `(~${Math.ceil(totalChars / charsRatio)}t)`;
                        }
                    }
                });
            }
        }, 100);

        try {
            await this.app.activeBatch.startAll((draftIdx, data) => {
                const actualDraftIdx = draftIdx + draftOffset;
                this.app.state.updateBatchDraft(msgIndex, actualDraftIdx, data);
                
                if (this.app.state.history[msgIndex].activeDraftIndex === actualDraftIdx) {
                    const contentNode = document.getElementById(`content-${msgIndex}`);
                    const reasonNode = document.getElementById(`reasoning-${msgIndex}`);
                    const reasonDiv = document.getElementById(`reasoning-block-${msgIndex}`);
                    
                    if (data.reasoning) {
                        let wasAtBottom = true;
                        if (reasonDiv && !reasonDiv.classList.contains('hidden')) {
                            wasAtBottom = Math.abs(reasonDiv.scrollHeight - reasonDiv.scrollTop - reasonDiv.clientHeight) < 30;
                        }
                        if (reasonNode) reasonNode.textContent = data.reasoning;
                        if (reasonDiv) {
                            reasonDiv.classList.remove('hidden');
                            if (data.status === 'streaming' && wasAtBottom) reasonDiv.scrollTop = reasonDiv.scrollHeight;
                        }
                    }
                    if (contentNode) {
                        const draftObj = this.app.state.history[msgIndex].drafts[actualDraftIdx];
                        const isHighlight = msgIndex >= this.app.state.history.length - settings.highlightTurnCount;
                        TextRenderer.setNodeContent(contentNode, data.content, draftObj, isHighlight);
                    }
                    if (!this.app.isUserScrolledUp) this.app.turnRenderer.scrollToBottom();
                }

                if (this.app.draftSwitcher.activeMsgIndex === msgIndex) {
                    const iconEl = document.getElementById(`tb-draft-icon-${actualDraftIdx}`);
                    if (iconEl) iconEl.textContent = {'done':'✔️', 'error':'❌', 'streaming':'🕒'}[data.status] || '';
                    if (data.status !== 'streaming') {
                        const timerEl = document.getElementById(`tb-timer-${actualDraftIdx}`);
                        if (timerEl) timerEl.textContent = `(${data.duration}s)`;
                    }
                }
            });
        } finally {
            if (this.app.batchTimerInterval) clearInterval(this.app.batchTimerInterval);
            this.app.activeBatch = null;
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');

            if (this.app.draftSwitcher.activeMsgIndex === msgIndex) {
                this.app.draftSwitcher.renderSwitcher(msgIndex, false);
            }
            this.app.summaryManager.updateSummaryMeter();
            this.app.requestTracker.endTask();
            this.app.autoSave();
        }
    }
}
// END FILE: js/services/GenerationCoordinator.js