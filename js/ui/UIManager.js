import { settings } from '../state/AppSettings.js';
import { StoryState } from '../state/StoryState.js';
import { ParallelGenerationBatch } from '../api/OpenAIClient.js';
import { StorageManager } from '../storage/StorageManager.js';

import { TextRenderer } from './TextRenderer.js';
import { DraftSwitcher } from './DraftSwitcher.js';

import { ApplyEditsManager } from './ApplyEditsManager.js';
import { BrainstormManager } from './BrainstormManager.js';
import { SummaryManager } from './SummaryManager.js';
import { ToolsManager } from './ToolsManager.js';
import { QuickRepliesManager } from './QuickRepliesManager.js';
import { DraftMergeManager } from './DraftMergeManager.js';
import { MemoryHistoryManager } from './MemoryHistoryManager.js';
import { NotesManager } from './NotesManager.js';

import { CloudSyncUI } from './CloudSyncUI.js';
import { SlotManager } from './SlotManager.js';
import { RemoteManagerUI } from './RemoteManagerUI.js';

export class UIManager {
    constructor() {
        this.state = new StoryState();
        this.storage = new StorageManager();
        this.activeBatch = null;
        this.activeSlot = '1';
        this.activeSlotName = `Slot 1`;
        this.activeSlotDesc = ``;
        this.batchTimerInterval = null;
        this.batchStartTime = 0;
        this.historyOffset = 0;
        
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');
        
        this.isUserScrolledUp = false;
        this.activeSumJob = null;
        this.sumTargetIndices = [];
        
        this.moodTags = [];
        this.hardcodedMoods = ['Action-packed', 'Aggressive', 'Alien', 'Angsty', 'Bleak', 'Chaotic', 'Cheerful', 'Cinematic', 'Comedic', 'Cozy', 'Creepy', 'Cyberpunk', 'Dark', 'Desperate', 'Dramatic', 'Dreamy', 'Eerie', 'Epic', 'Euphoric', 'Fast-paced', 'Flirty', 'Gloomy', 'Gothic', 'Gritty', 'Heartwarming', 'Heroic', 'Hopeful', 'Horror', 'Intense', 'Lighthearted', 'Melancholic', 'Mysterious', 'Noir', 'Nostalgic', 'Ominous', 'Optimistic', 'Peaceful', 'Philosophical', 'Playful', 'Romantic', 'Sci-Fi', 'Sensual', 'Sexy', 'Serious', 'Slow-burn', 'Steampunk', 'Suspenseful', 'Tense', 'Tragic', 'Whimsical', 'Wholesome'];

        // Instantiate sub-managers
        this.draftSwitcher = new DraftSwitcher(this);
        this.applyEditsManager = new ApplyEditsManager(this);
        this.brainstormManager = new BrainstormManager(this);
        this.summaryManager = new SummaryManager(this);
        this.toolsManager = new ToolsManager(this);
        this.quickRepliesManager = new QuickRepliesManager(this);
        this.draftMergeManager = new DraftMergeManager(this);
        this.memoryHistoryManager = new MemoryHistoryManager(this);
        this.notesManager = new NotesManager(this);
        this.cloudSyncUI = new CloudSyncUI(this);
        this.slotManager = new SlotManager(this);
        this.remoteManagerUI = new RemoteManagerUI(this);

        this.bindEvents();
        this.initApp();
    }

    async initApp() {
        await this.storage.init();
        const lastSlot = localStorage.getItem('last_active_slot') || '1';
        await this.loadStateFromSlot(lastSlot);
        
        const fab = document.getElementById('btn-jump-bottom');
        this.container.addEventListener('scroll', () => {
            this.isUserScrolledUp = (this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight) > 50;
            if (this.isUserScrolledUp) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        });
        fab.addEventListener('click', () => {
            this.isUserScrolledUp = false;
            this.scrollToBottom();
        });

        this.summaryManager.updateSummaryMeter();
    }

    bindEvents() {
        document.getElementById('btn-send').addEventListener('click', () => this.handleSend());
        document.getElementById('btn-retry').addEventListener('click', () => this.handleRetry());
        document.getElementById('btn-abort').addEventListener('click', () => this.handleAbort());
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { 
                e.preventDefault(); 
                this.handleSend(); 
            }
        });

        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = (this.input.scrollHeight) + 'px';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeBatch) {
                this.handleAbort();
                return;
            }
            if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                if (this.state.history.length === 0) return;
                const lastIdx = this.state.history.length - 1;
                const msg = this.state.history[lastIdx];
                if (msg.isBatch && msg.drafts.length > 1) {
                    this.draftSwitcher.switchDraft(lastIdx, e.key === 'ArrowLeft' ? -1 : 1);
                }
            }
        });

        document.getElementById('btn-more-menu').addEventListener('click', () => {
            document.getElementById('quick-menu').classList.toggle('hidden');
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            if (this.state.undo()) { this.renderAll(); this.autoSave(); }
        });
        document.getElementById('btn-redo').addEventListener('click', () => {
            if (this.state.redo()) { this.renderAll(); this.autoSave(); }
        });

        document.getElementById('btn-edit-cancel').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-save').addEventListener('click', () => {
            const idx = parseInt(document.getElementById('btn-edit-save').dataset.idx);
            const newContent = document.getElementById('edit-message-content').value;
            const msg = this.state.history[idx];
            if (!msg) return;

            if (msg.role === 'aggregation') {
                if (msg.meta.displayInput === newContent) {
                    document.getElementById('edit-modal').classList.add('hidden');
                    return;
                }
                const oldInstructions = msg.meta.displayInput;
                msg.meta.displayInput = newContent;
                if (oldInstructions && msg.drafts[0]?.content) {
                    msg.drafts[0].content = msg.drafts[0].content.replaceAll(oldInstructions, newContent);
                }
                this.state.redoStack = [];
            } else {
                const currentContent = this.state.getContent(idx);
                if (newContent === currentContent) {
                    document.getElementById('edit-modal').classList.add('hidden');
                    return;
                }
                this.state.editTurn(idx, newContent);
            }
            
            document.getElementById('edit-modal').classList.add('hidden');
            this.renderAll();
            this.autoSave();
        });
        document.getElementById('btn-close-prompt').addEventListener('click', () => document.getElementById('prompt-modal').classList.add('hidden'));
        document.getElementById('btn-close-usage').addEventListener('click', () => document.getElementById('usage-modal').classList.add('hidden'));
        
        // Surgical Edit Bindings
        document.addEventListener('selectionchange', () => {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = setTimeout(() => this.handleSelectionChange(), 150);
        });

        const floatBtn = document.getElementById('floating-edit-btn');
        floatBtn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent focus loss that clears selection
            this.openSurgicalEdit();
        });

        document.getElementById('btn-close-surgical').addEventListener('click', () => document.getElementById('surgical-edit-modal').classList.add('hidden'));
        document.getElementById('btn-surgical-cancel').addEventListener('click', () => document.getElementById('surgical-edit-modal').classList.add('hidden'));
        
        document.getElementById('surgical-context-lines').addEventListener('change', (e) => {
            if (!this.surgicalState) return;
            this.surgicalState.contextLines = parseInt(e.target.value);
            this.updateSurgicalModal(false); 
        });

        document.getElementById('btn-surgical-apply').addEventListener('click', () => this.applySurgicalEdit());
    }

    handleSelectionChange() {
        const sel = window.getSelection();
        const floatBtn = document.getElementById('floating-edit-btn');
        
        if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) {
            floatBtn.classList.remove('visible');
            return;
        }

        const range = sel.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;
        
        const turnContent = container.closest('.turn-content');
        if (!turnContent) {
            floatBtn.classList.remove('visible');
            return;
        }
        
        const turnElement = turnContent.closest('.turn');
        if (!turnElement) return;

        const idMatch = turnElement.id.match(/turn-wrapper-(\d+)/);
        if (!idMatch) return;
        
        const msgIndex = parseInt(idMatch[1]);
        const rect = range.getBoundingClientRect();
        
        floatBtn.style.left = `${rect.left + rect.width / 2}px`;
        floatBtn.style.top = `${Math.max(10, rect.top)}px`;
        floatBtn.classList.add('visible');
        
        this.pendingSurgicalEdit = { msgIndex, range: range.cloneRange(), turnElement };
    }

    openSurgicalEdit() {
        document.getElementById('floating-edit-btn').classList.remove('visible');
        if (!this.pendingSurgicalEdit) return;
        
        const { msgIndex, range, turnElement } = this.pendingSurgicalEdit;
        const contentNode = turnElement.querySelector(`#content-${msgIndex}`);
        if (!contentNode) return;
        
        const msg = this.state.history[msgIndex];
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        const rawBlocks = TextRenderer.splitParagraphsSafely(activeDraft.content);
        
        const markers = Array.from(contentNode.querySelectorAll('.p-marker'));
        if (markers.length === 0) return; 
        
        let startP = -1;
        let endP = -1;
        let foundEnd = false;
        
        markers.forEach(marker => {
            if (foundEnd || !marker.parentNode) return;
            
            const p = parseInt(marker.dataset.p);
            try {
                // Returns -1 if marker is before range, 0 if inside, 1 if after
                const cmp = range.comparePoint(marker.parentNode, Array.from(marker.parentNode.childNodes).indexOf(marker));
                
                if (cmp === 0) { 
                    if (startP === -1) startP = p;
                    endP = p;
                } else if (cmp === 1) {
                    if (startP === -1) startP = p;
                    endP = p;
                    foundEnd = true;
                }
            } catch (e) {
                // Fallback for detached nodes
            }
        });
        
        if (startP === -1) startP = 0;
        if (endP === -1) endP = markers.length - 1;

        this.surgicalState = { msgIndex, rawBlocks, startP, endP, contextLines: parseInt(document.getElementById('surgical-context-lines').value) || 1 };
        this.updateSurgicalModal(true);
        
        document.getElementById('surgical-edit-modal').classList.remove('hidden');
        window.getSelection().removeAllRanges();
    }

    updateSurgicalModal(overwriteTextarea = true) {
        const { rawBlocks, startP, endP, contextLines } = this.surgicalState;
        
        const topStart = Math.max(0, startP - contextLines);
        const topBlocks = rawBlocks.slice(topStart, startP);
        const topEl = document.getElementById('surgical-top-context');
        topEl.textContent = topBlocks.join('');
        topEl.style.display = topBlocks.length ? 'block' : 'none';
        
        if (overwriteTextarea) {
            const activeBlocks = rawBlocks.slice(startP, endP + 1);
            document.getElementById('surgical-edit-textarea').value = activeBlocks.join('');
        }
        
        const bottomEnd = Math.min(rawBlocks.length, endP + 1 + contextLines);
        const bottomBlocks = rawBlocks.slice(endP + 1, bottomEnd);
        const bottomEl = document.getElementById('surgical-bottom-context');
        bottomEl.textContent = bottomBlocks.join('');
        bottomEl.style.display = bottomBlocks.length ? 'block' : 'none';
    }

    applySurgicalEdit() {
        if (!this.surgicalState) return;
        const { msgIndex, rawBlocks, startP, endP } = this.surgicalState;
        
        const newActiveText = document.getElementById('surgical-edit-textarea').value;
        const before = rawBlocks.slice(0, startP).join('');
        const after = rawBlocks.slice(endP + 1).join('');
        
        const finalContent = before + newActiveText + after;
        
        const currentContent = this.state.getContent(msgIndex);
        if (finalContent !== currentContent) {
            this.state.editTurn(msgIndex, finalContent);
            this.renderAll();
            this.autoSave();
        }
        
        document.getElementById('surgical-edit-modal').classList.add('hidden');
        this.surgicalState = null;
    }

    handleRetry() {
        if (this.state.history.length === 0) return;
        const lastIdx = this.state.history.length - 1;
        const last = this.state.history[lastIdx];
        if (last.role === 'assistant') {
            this.state.markDraftsAsStale(lastIdx);
            this.renderAll();
            this.handleSend(true, lastIdx);
        }
    }

    async handleSend(isRetry = false, targetIndex = null) {
        if (this.activeBatch) return;

        const text = this.input.value.trim();
        if (!isRetry) {
            if (!text && this.state.history.length === 0) return;
            if (text) {
                this.state.addTurn('user', text);
                this.input.value = '';
                this.input.style.height = 'auto';
                this.renderAll(); 
            }
        }

        const oldSwitcher = document.getElementById(`switcher-${this.state.history.length - 1}`);
        if (oldSwitcher) oldSwitcher.remove();

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.isUserScrolledUp = false;

        // Temporarily pop target message so it's not included in its own payload
        let tempMsg = null;
        if (targetIndex !== null) {
            tempMsg = this.state.history.pop();
        }
        
        const payloadObj = this.state.buildPromptPayload();
        
        if (tempMsg) {
            this.state.history.push(tempMsg);
        }
        
        let originalModel = settings.model;
        let originalEnabled = settings.parallelEnabled;
        let originalCount = settings.parallelCount;
        let originalOverrides = settings.parallelOverrides;

        let count = settings.parallelEnabled ? parseInt(settings.parallelCount) : 1;
        
        if (this.overrideNextSend) {
            settings.model = this.overrideNextSend.draft1Model || originalModel;
            settings.parallelEnabled = true;
            settings.parallelCount = this.overrideNextSend.count || 1;
            settings.parallelOverrides = this.overrideNextSend.overrides || [];
            count = settings.parallelCount;
        }

        this.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, settings.parallelOverrides);
        
        if (this.overrideNextSend) {
            settings.model = originalModel;
            settings.parallelEnabled = originalEnabled;
            settings.parallelCount = originalCount;
            settings.parallelOverrides = originalOverrides;
            this.overrideNextSend = null;
        }
        
        const newIdx = targetIndex !== null ? targetIndex : this.state.history.length;
        let draftOffset = 0;

        if (targetIndex !== null) {
            draftOffset = this.state.history[newIdx].drafts.length;
            this.state.appendBatchDrafts(newIdx, count);
            this.state.setActiveDraft(newIdx, draftOffset);
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
        } else {
            this.state.addBatchTurn(count, 'assistant');
        }

        this.appendTurnToDOM('assistant', newIdx);
        
        if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
        this.batchStartTime = Date.now();
        this.batchTimerInterval = setInterval(() => {
            if (!this.activeBatch || this.activeBatch.isFinished) {
                clearInterval(this.batchTimerInterval);
                return;
            }
            
            const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
            
            this.activeBatch.jobs.forEach((job, i) => {
                if (job.status === 'streaming') {
                    const actualDraftIdx = i + draftOffset;
                    const timerEl = document.getElementById(`batch-timer-${newIdx}-${actualDraftIdx}`);
                    if (timerEl) {
                        const draftData = this.state.history[newIdx].drafts[actualDraftIdx];
                        const totalChars = (draftData.content?.length || 0) + (draftData.reasoning?.length || 0);
                        const estTokens = Math.ceil(totalChars / charsRatio);
                        timerEl.textContent = `(~${estTokens}t)`;
                    }
                }
            });
        }, 100);

        // Save state immediately before sending the network request
        // so we don't lose the user's message if the app is killed while waiting.
        this.autoSave();

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                const actualDraftIdx = draftIdx + draftOffset;
                this.state.updateBatchDraft(newIdx, actualDraftIdx, data);
                
                if (this.state.history[newIdx].activeDraftIndex === actualDraftIdx) {
                    const contentNode = document.getElementById(`content-${newIdx}`);
                    const reasonNode = document.getElementById(`reasoning-${newIdx}`);
                    const reasonDiv = document.getElementById(`reasoning-block-${newIdx}`);
                    
                    if (data.reasoning) {
                        // Check if at the bottom BEFORE mutating text content
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
                        const draftObj = this.state.history[newIdx].drafts[actualDraftIdx];
                        const isHighlight = newIdx >= this.state.history.length - settings.highlightTurnCount;
                        TextRenderer.setNodeContent(contentNode, data.content, draftObj, isHighlight);
                    }
                    
                    if (!this.isUserScrolledUp) this.scrollToBottom();
                }

                const iconMap = { 'done':'✔️', 'error':'❌', 'streaming':'🕒' };
                const iconEl = document.getElementById(`draft-icon-${newIdx}-${actualDraftIdx}`);
                if (iconEl) iconEl.textContent = iconMap[data.status] || '';
                
                if (data.status !== 'streaming') {
                    const timerEl = document.getElementById(`batch-timer-${newIdx}-${actualDraftIdx}`);
                    if (timerEl) timerEl.textContent = `(${data.duration}s)`;
                }
            });
        } finally {
            if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
            if (this.activeBatch && this.activeBatch.jobs[0]) {
                this.state.lastRawPayload = this.activeBatch.jobs[0].rawPayload;
            }
            this.activeBatch = null;
            
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            
            let tempMsgFinal = null;
            if (targetIndex !== null) tempMsgFinal = this.state.history.pop();
            this.state.buildPromptPayload();
            if (tempMsgFinal) this.state.history.push(tempMsgFinal);

            this.appendTurnToDOM('assistant', newIdx);
            this.summaryManager.updateSummaryMeter();

            if (!this.isUserScrolledUp) this.scrollToBottom();
            this.autoSave();
        }
    }

    async generateAdditionalDrafts(msgIndex, modelList) {
        if (this.activeBatch) return;

        // 1. Show Cancel/Stop button
        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');

        // 2. Extract context up to msgIndex
        const popped = this.state.history.splice(msgIndex + 1);
        const targetMsg = this.state.history.pop(); 
        
        const payloadObj = this.state.buildPromptPayload();
        
        this.state.history.push(targetMsg);
        this.state.history.push(...popped);

        const count = modelList.length;
        const overrides = modelList.map(m => ({ enabled: true, model: m }));
        
        this.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, overrides);
        const draftOffset = targetMsg.drafts.length;
        
        // 3. Mark message as batch, append draft slots, and point active to new draft
        targetMsg.isBatch = true;
        this.state.appendBatchDrafts(msgIndex, count);
        this.state.setActiveDraft(msgIndex, draftOffset);

        // 4. Immediately rebuild the switcher in the DOM so that the dropdown has
        //    the new options and status icons (allowing streaming updates to bind)
        const oldSwitcher = document.getElementById(`switcher-${msgIndex}`);
        const newSwitcher = this.draftSwitcher.buildSwitcherDOM(msgIndex, targetMsg, true);
        if (oldSwitcher) {
            oldSwitcher.replaceWith(newSwitcher);
        } else {
            const wrapper = document.getElementById(`turn-wrapper-${msgIndex}`);
            if (wrapper) wrapper.insertBefore(newSwitcher, wrapper.firstChild);
        }
        this.draftSwitcher.switchDraftExplicit(msgIndex, draftOffset);

        if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
        this.batchStartTime = Date.now();
        this.batchTimerInterval = setInterval(() => {
            if (!this.activeBatch || this.activeBatch.isFinished) {
                clearInterval(this.batchTimerInterval);
                return;
            }
            const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
            this.activeBatch.jobs.forEach((job, i) => {
                if (job.status === 'streaming') {
                    const actualDraftIdx = i + draftOffset;
                    const timerEl = document.getElementById(`batch-timer-${msgIndex}-${actualDraftIdx}`);
                    if (timerEl) {
                        const draftData = this.state.history[msgIndex].drafts[actualDraftIdx];
                        const totalChars = (draftData.content?.length || 0) + (draftData.reasoning?.length || 0);
                        timerEl.textContent = `(~${Math.ceil(totalChars / charsRatio)}t)`;
                    }
                }
            });
        }, 100);

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                const actualDraftIdx = draftIdx + draftOffset;
                this.state.updateBatchDraft(msgIndex, actualDraftIdx, data);
                
                if (this.state.history[msgIndex].activeDraftIndex === actualDraftIdx) {
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
                        const draftObj = this.state.history[msgIndex].drafts[actualDraftIdx];
                        const isHighlight = msgIndex >= this.state.history.length - settings.highlightTurnCount;
                        TextRenderer.setNodeContent(contentNode, data.content, draftObj, isHighlight);
                    }
                    if (!this.isUserScrolledUp) this.scrollToBottom();
                }

                const iconEl = document.getElementById(`draft-icon-${msgIndex}-${actualDraftIdx}`);
                if (iconEl) iconEl.textContent = {'done':'✔️', 'error':'❌', 'streaming':'🕒'}[data.status] || '';
                
                if (data.status !== 'streaming') {
                    const timerEl = document.getElementById(`batch-timer-${msgIndex}-${actualDraftIdx}`);
                    if (timerEl) timerEl.textContent = `(${data.duration}s)`;
                }
            });
        } finally {
            if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
            this.activeBatch = null;
            
            // 5. Restore standard Send/Retry buttons
            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');

            const currentSwitcher = document.getElementById(`switcher-${msgIndex}`);
            if (currentSwitcher) {
                currentSwitcher.replaceWith(this.draftSwitcher.buildSwitcherDOM(msgIndex, this.state.history[msgIndex], false));
            }
            this.summaryManager.updateSummaryMeter();
            this.autoSave();
        }
    }

    handleAbort() {
        if (this.activeBatch) this.activeBatch.cancelAll();
    }

    renderAll() {
        const oldScrollHeight = this.container.scrollHeight;
        const oldScrollTop = this.container.scrollTop;

        this.container.innerHTML = '';
        this.container.className = `${settings.displayMode}-mode`;

        let startIndex = 0;
        if (settings.visibleOutOfContext !== -1) {
            startIndex = Math.max(0, this.state.contextBoundaryIndex - settings.visibleOutOfContext - this.historyOffset);
        }

        if (startIndex > 0) {
            const btn = document.createElement('div');
            btn.className = 'load-older-btn';
            btn.textContent = `▲ Load Older Messages (${startIndex} hidden)`;
            btn.onclick = () => {
                this.historyOffset += 10;
                this.renderAll();
            };
            this.container.appendChild(btn);
        }

        this.state.history.forEach((turn, idx) => {
            if (idx < startIndex) return; 

            if (idx === this.state.contextBoundaryIndex + 1 && this.state.contextBoundaryIndex >= 0) {
                const divider = document.createElement('div');
                divider.className = 'context-divider';
                divider.textContent = 'Context Boundary';
                this.container.appendChild(divider);
            }
            this.appendTurnToDOM(turn.role, idx);
        });

        if (startIndex > 0 && this.historyOffset > 0 && oldScrollHeight > 0) {
            const newScrollHeight = this.container.scrollHeight;
            this.container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        } else if (!this.isUserScrolledUp) {
            this.scrollToBottom();
        }

        this.summaryManager.updateSummaryMeter();
    }

    appendTurnToDOM(role, index) {
        const msg = this.state.history[index];
        const isStreaming = this.activeBatch && index === this.state.history.length - 1;
        const isLatestMessage = index === this.state.history.length - 1;
        const isOutOfContext = index <= this.state.contextBoundaryIndex;
        const isHighlight = index >= this.state.history.length - settings.highlightTurnCount;
        
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;
        if (isOutOfContext) wrapper.classList.add('out-of-context');
        if (msg.isHidden) wrapper.classList.add('hidden-msg');
        wrapper.id = `turn-wrapper-${index}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';

        // System Role
        if (role === 'system') {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'turn-content';
            const spanContent = document.createElement('div');
            spanContent.id = `content-${index}`;
            TextRenderer.setNodeContent(spanContent, msg.drafts[0].content || '', msg.drafts[0], isHighlight);
            contentDiv.appendChild(spanContent);
            bubble.appendChild(contentDiv);
        }
        // Aggregation Request Role
        else if (role === 'aggregation') {
            const header = document.createElement('div');
            header.className = 'aggregation-header';
            header.innerHTML = `<span>🛠️ Aggregation Request</span>`;
            bubble.appendChild(header);

            // Action Controls
            const actionBar = document.createElement('div');
            actionBar.className = 'action-bar';
            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'action-icons';
            
            const btnHide = document.createElement('span');
            btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
            btnHide.className = 'hide-toggle';
            if (msg.isHidden) btnHide.classList.add('active');
            btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
            btnHide.addEventListener('click', () => {
                msg.isHidden = !msg.isHidden;
                btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
                if (msg.isHidden) wrapper.classList.add('hidden-msg');
                else wrapper.classList.remove('hidden-msg');
                this.state.buildPromptPayload();
                this.summaryManager.updateSummaryMeter();
                this.autoSave();
            });
            iconsDiv.appendChild(btnHide);

            const btnEdit = document.createElement('span');
            btnEdit.textContent = '✏️';
            btnEdit.title = "Edit";
            btnEdit.addEventListener('click', () => {
                document.getElementById('edit-message-content').value = msg.meta.displayInput || '';
                document.getElementById('btn-edit-save').dataset.idx = index;
                document.getElementById('edit-modal').classList.remove('hidden');
            });
            iconsDiv.appendChild(btnEdit);
            
            const btnDelete = document.createElement('span');
            btnDelete.textContent = '🗑️';
            btnDelete.title = "Delete";
            btnDelete.addEventListener('click', () => {
                if (confirm("Delete this message?")) {
                    this.state.deleteTurn(index);
                    this.state.buildPromptPayload(); 
                    this.renderAll();
                    this.autoSave();
                }
            });
            iconsDiv.appendChild(btnDelete);
            
            actionBar.appendChild(document.createElement('span')); 
            actionBar.appendChild(iconsDiv);
            bubble.appendChild(actionBar);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'turn-content';
            contentDiv.style.fontStyle = 'italic';
            contentDiv.style.color = 'var(--text-muted)';
            
            const spanContent = document.createElement('span');
            spanContent.id = `content-${index}`;
            spanContent.textContent = msg.meta.displayInput || '';
            contentDiv.appendChild(spanContent);
            
            bubble.appendChild(contentDiv);
        }
        else if (role === 'choices') {
            if (msg.extractedChoices === null) {
                const header = document.createElement('div');
                header.className = 'choices-header';
                header.innerHTML = `<span>Scrying possible futures...</span> <span class="streaming-indicator"></span>`;
                bubble.appendChild(header);

                const statusRow = document.createElement('div');
                statusRow.className = 'switcher-status';
                statusRow.style.justifyContent = 'center';
                
                msg.drafts.forEach((d, i) => {
                    const spanGroup = document.createElement('span');
                    const icon = document.createElement('span');
                    icon.id = `choice-icon-${index}-${i}`;
                    icon.textContent = '🕒';
                    const timer = document.createElement('span');
                    timer.id = `choice-timer-${index}-${i}`;
                    timer.style.marginLeft = '4px';
                    timer.textContent = '(0.0s)';
                    spanGroup.appendChild(icon);
                    spanGroup.appendChild(timer);
                    statusRow.appendChild(spanGroup);
                });
                bubble.appendChild(statusRow);
            } else {
                const header = document.createElement('div');
                header.className = 'choices-header';
                header.textContent = `Select a Path (${settings.activeChoicePromptTitle})`;
                bubble.appendChild(header);

                msg.extractedChoices.forEach(choiceText => {
                    const card = document.createElement('div');
                    card.className = 'choice-card';
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'choice-card-content';
                    const visuallyApplied = settings.applyRegexes(choiceText, 'visually');
                    contentDiv.innerHTML = marked.parseInline(visuallyApplied);
                    
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'choice-card-actions';

                    const btnInsert = document.createElement('button');
                    btnInsert.innerHTML = '📝';
                    btnInsert.title = 'Insert to input';
                    btnInsert.addEventListener('click', () => {
                        const currentVal = this.input.value;
                        this.input.value = currentVal ? currentVal + ' ' + choiceText : choiceText;
                        this.input.style.height = 'auto';
                        this.input.style.height = (this.input.scrollHeight) + 'px';
                        this.input.focus();
                    });

                    const btnSend = document.createElement('button');
                    btnSend.innerHTML = '🚀';
                    btnSend.title = 'Send instantly';
                    btnSend.addEventListener('click', () => {
                        this.input.value = choiceText;
                        this.input.style.height = 'auto';
                        this.input.style.height = (this.input.scrollHeight) + 'px';
                        this.handleSend();
                    });

                    actionsDiv.appendChild(btnInsert);
                    actionsDiv.appendChild(btnSend);

                    card.appendChild(contentDiv);
                    card.appendChild(actionsDiv);
                    bubble.appendChild(card);
                });

                const hr = document.createElement('hr');
                hr.style.margin = '8px 0';
                bubble.appendChild(hr);

                const footerGrid = document.createElement('div');
                footerGrid.className = 'action-grid';
                
                const btnReroll = document.createElement('button');
                btnReroll.className = 'secondary';
                btnReroll.textContent = '🔄 Reroll';
                btnReroll.addEventListener('click', () => {
                    this.state.deleteTurn(index);
                    this.brainstormManager.startChoicesGeneration();
                });
                
                const btnDel = document.createElement('button');
                btnDel.className = 'danger';
                btnDel.textContent = '🗑️ Delete';
                btnDel.addEventListener('click', () => {
                    this.state.deleteTurn(index);
                    this.renderAll();
                    this.autoSave();
                });

                footerGrid.appendChild(btnReroll);
                footerGrid.appendChild(btnDel);
                bubble.appendChild(footerGrid);
            }
        } else {
            const activeDraft = msg.drafts[msg.activeDraftIndex];
            const content = activeDraft.content;
            const reasoning = activeDraft.reasoning;

            if (msg.isBatch && msg.drafts.length > 1 && isLatestMessage) {
                wrapper.appendChild(this.draftSwitcher.buildSwitcherDOM(index, msg, isStreaming));
            }

            if (!isStreaming) {
                const actionBar = document.createElement('div');
                actionBar.className = 'action-bar';
                
                const metaSpan = document.createElement('span');
                metaSpan.id = `meta-span-${index}`;
                if (activeDraft.model) {
                    const shortModel = activeDraft.model.split('/').pop();
                    metaSpan.textContent = `${shortModel} • ${activeDraft.isStale ? '[X]' : activeDraft.duration + 's'}`;
                }
                actionBar.appendChild(metaSpan);

                const iconsDiv = document.createElement('div');
                iconsDiv.className = 'action-icons';

                if (reasoning) {
                    const btnThink = document.createElement('span');
                    btnThink.textContent = '🧠';
                    btnThink.className = 'think-toggle';
                    btnThink.title = "Toggle Thinking";
                    btnThink.addEventListener('click', () => {
                        const rDiv = document.getElementById(`reasoning-block-${index}`);
                        if (rDiv) {
                            rDiv.classList.toggle('hidden');
                            btnThink.classList.toggle('active');
                        }
                    });
                    iconsDiv.appendChild(btnThink);
                }

                const btnHide = document.createElement('span');
                btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                btnHide.className = 'hide-toggle';
                if (msg.isHidden) btnHide.classList.add('active');
                btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
                btnHide.addEventListener('click', () => {
                    msg.isHidden = !msg.isHidden;
                    btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                    btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
                    if (msg.isHidden) {
                        wrapper.classList.add('hidden-msg');
                    } else {
                        wrapper.classList.remove('hidden-msg');
                    }
                    this.state.buildPromptPayload();
                    this.summaryManager.updateSummaryMeter();
                    this.autoSave();
                });
                iconsDiv.appendChild(btnHide);

                const btnMd = document.createElement('span');
                btnMd.id = `btn-md-${index}`;
                btnMd.textContent = 'Ⓜ️';
                btnMd.className = 'md-toggle';
                btnMd.title = "Toggle Markdown";
                if (TextRenderer.shouldUseMarkdown(content || '', activeDraft.markdownOverride)) btnMd.classList.add('active');
                btnMd.addEventListener('click', () => {
                    const currentDraft = this.state.history[index].drafts[this.state.history[index].activeDraftIndex];
                    const currentlyOn = TextRenderer.shouldUseMarkdown(currentDraft.content, currentDraft.markdownOverride);
                    currentDraft.markdownOverride = !currentlyOn;
                    this.renderAll();
                    this.autoSave();
                });
                iconsDiv.appendChild(btnMd);

                const btnCopy = document.createElement('span');
                btnCopy.textContent = '📋';
                btnCopy.title = "Copy";
                btnCopy.addEventListener('click', () => navigator.clipboard.writeText(this.state.getContent(index)));
                iconsDiv.appendChild(btnCopy);

                const btnEdit = document.createElement('span');
                btnEdit.textContent = '✏️';
                btnEdit.title = "Edit";
                btnEdit.addEventListener('click', () => {
                    document.getElementById('edit-message-content').value = this.state.getContent(index);
                    document.getElementById('btn-edit-save').dataset.idx = index;
                    document.getElementById('edit-modal').classList.remove('hidden');
                });
                iconsDiv.appendChild(btnEdit);

                const btnUsage = document.createElement('span');
                btnUsage.id = `btn-usage-${index}`;
                btnUsage.textContent = '📊';
                btnUsage.title = "Token Usage";
                btnUsage.addEventListener('click', () => {
                    const currentDraft = this.state.history[index].drafts[this.state.history[index].activeDraftIndex];
                    if (currentDraft.usage) {
                        document.getElementById('usage-prompt').textContent = currentDraft.usage.prompt_tokens || 0;
                        
                        const compTokens = currentDraft.usage.completion_tokens || 0;
                        const reasonTokens = currentDraft.usage.completion_tokens_details?.reasoning_tokens || 0;
                        
                        const usageCompletionEl = document.getElementById('usage-completion');
                        const usageReasoningRow = document.getElementById('usage-reasoning-row');
                        
                        if (reasonTokens > 0) {
                            usageCompletionEl.textContent = `${compTokens - reasonTokens} (Output) + ${reasonTokens}`;
                            document.getElementById('usage-reasoning').textContent = reasonTokens;
                            usageReasoningRow.classList.remove('hidden');
                        } else {
                            usageCompletionEl.textContent = compTokens;
                            usageReasoningRow.classList.add('hidden');
                        }
                        
                        document.getElementById('usage-total').textContent = currentDraft.usage.total_tokens || 0;
                        document.getElementById('usage-modal').classList.remove('hidden');
                    }
                });
                
                if (role !== 'assistant' || !activeDraft.usage) {
                    btnUsage.classList.add('hidden');
                }
                iconsDiv.appendChild(btnUsage);

                if (role === 'assistant' && isLatestMessage && this.state.lastRawPayload) {
                    const btnPrompt = document.createElement('span');
                    btnPrompt.textContent = '🔍';
                    btnPrompt.title = "View Prompt Payload";
                    btnPrompt.addEventListener('click', () => {
                        document.getElementById('prompt-payload-content').textContent = JSON.stringify(this.state.lastRawPayload, null, 2);
                        document.getElementById('prompt-modal').classList.remove('hidden');
                    });
                    iconsDiv.appendChild(btnPrompt);
                }

                const btnDelete = document.createElement('span');
                btnDelete.textContent = '🗑️';
                btnDelete.title = "Delete";
                btnDelete.addEventListener('click', () => {
                    if (confirm("Delete this message?")) {
                        this.state.deleteTurn(index);
                        this.state.buildPromptPayload(); 
                        this.renderAll();
                        this.autoSave();
                    }
                });
                iconsDiv.appendChild(btnDelete);

                actionBar.appendChild(iconsDiv);
                bubble.appendChild(actionBar);
            }

            const reasoningDiv = document.createElement('div');
            reasoningDiv.className = 'thinking-block';
            reasoningDiv.id = `reasoning-block-${index}`;
            if (!reasoning || (!isStreaming && role === 'assistant')) reasoningDiv.classList.add('hidden');
            
            const spanReason = document.createElement('span');
            spanReason.id = `reasoning-${index}`;
            spanReason.textContent = reasoning || '';
            reasoningDiv.appendChild(spanReason);
            bubble.appendChild(reasoningDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'turn-content';
            
            const spanContent = document.createElement('div');
            spanContent.style.display = "inline";
            spanContent.id = `content-${index}`;
            TextRenderer.setNodeContent(spanContent, content || '', activeDraft, isHighlight);
            contentDiv.appendChild(spanContent);
            
            if (isStreaming) {
                const cursor = document.createElement('span');
                cursor.className = 'streaming-indicator';
                cursor.id = `cursor-${index}`;
                contentDiv.appendChild(cursor);
            }

            bubble.appendChild(contentDiv);
        }

        wrapper.appendChild(bubble);
        this.container.appendChild(wrapper);
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
        document.getElementById('btn-jump-bottom').classList.add('hidden');
    }

    async autoSave() {
        await this.storage.saveSlot(this.activeSlot, this.activeSlotName, this.activeSlotDesc, this.state.exportData());
        localStorage.setItem('last_active_slot', this.activeSlot);
        if (this.slotManager) this.slotManager.refreshSlotList();
    }

    async loadStateFromSlot(id) {
        this.activeSlot = id;
        localStorage.setItem('last_active_slot', id);
        
        const slot = await this.storage.loadSlot(id);
        if (slot) {
            this.activeSlotName = slot.name || `Slot ${id}`;
            this.activeSlotDesc = slot.description || ``;
            if (slot.data) {
                this.state.loadFromData(slot.data);
                document.getElementById('set-display-mode').value = settings.displayMode;
                if (document.getElementById('lbl-active-sum-prompt')) {
                    document.getElementById('lbl-active-sum-prompt').textContent = this.state.selectedAutoSumPromptTitle;
                }
            } else {
                this.state.clear(true);
            }
        } else {
            this.activeSlotName = `Slot ${id}`;
            this.activeSlotDesc = ``;
            this.state.clear(true); 
        }
        this.historyOffset = 0;
        this.state.buildPromptPayload();
        this.renderAll();
    }
}