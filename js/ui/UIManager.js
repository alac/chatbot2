import { settings } from '../state/AppSettings.js';
import { StoryState } from '../state/StoryState.js';
import { ParallelGenerationBatch, GenerationJob } from '../api/OpenAIClient.js';
import { StorageManager } from '../storage/StorageManager.js';
import { diffWords, diffLines } from '../utils/diff.js';

export class UIManager {
    constructor() {
        this.state = new StoryState();
        this.storage = new StorageManager();
        this.activeBatch = null;
        this.activeSlot = 1;
        this.activeSlotName = `Slot 1`;
        this.activeSlotDesc = ``;
        this.batchTimerInterval = null;
        this.batchStartTime = 0;
        this.historyOffset = 0;
        
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');
        
        this.isUserScrolledUp = false;
        this.extractedEdits = [];
        this.activeSumJob = null;
        this.sumTargetIndices = [];

        this.aeSettings = {
            groupEdits: true,
            collapseReasoning: true,
            hideInvalid: false,
            contextChars: 10
        };
        this.currentEditEditing = null;
        
        this.moodTags = [];
        this.hardcodedMoods = ['Action-packed', 'Aggressive', 'Alien', 'Angsty', 'Bleak', 'Chaotic', 'Cheerful', 'Cinematic', 'Comedic', 'Cozy', 'Creepy', 'Cyberpunk', 'Dark', 'Desperate', 'Dramatic', 'Dreamy', 'Eerie', 'Epic', 'Euphoric', 'Fast-paced', 'Flirty', 'Gloomy', 'Gothic', 'Gritty', 'Heartwarming', 'Heroic', 'Hopeful', 'Horror', 'Intense', 'Lighthearted', 'Melancholic', 'Mysterious', 'Noir', 'Nostalgic', 'Ominous', 'Optimistic', 'Peaceful', 'Philosophical', 'Playful', 'Romantic', 'Sci-Fi', 'Sensual', 'Sexy', 'Serious', 'Slow-burn', 'Steampunk', 'Suspenseful', 'Tense', 'Tragic', 'Whimsical', 'Wholesome'];

        this.bindEvents();
        this.initApp();
    }

    async initApp() {
        await this.storage.init();
        const lastSlot = localStorage.getItem('last_active_slot') || 1;
        await this.loadStateFromSlot(parseInt(lastSlot));
        
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

        this.updateSummaryMeter();
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
                    this.switchDraft(lastIdx, e.key === 'ArrowLeft' ? -1 : 1);
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

        // Quick Replies
        document.getElementById('btn-open-quick-replies').addEventListener('click', () => this.openQuickReplies());
        document.getElementById('btn-close-qr').addEventListener('click', () => document.getElementById('quick-replies-modal').classList.add('hidden'));
        
        const showQRView = (viewId) => {
            ['qr-button-container', 'qr-edit-container', 'qr-models-container'].forEach(id => {
                document.getElementById(id).classList.add('hidden');
            });
            document.getElementById(viewId).classList.remove('hidden');
        };

        document.getElementById('btn-edit-qr-toggle').addEventListener('click', () => {
            if (!document.getElementById('qr-edit-container').classList.contains('hidden')) {
                showQRView('qr-button-container');
            } else {
                document.getElementById('qr-edit-textarea').value = settings.quickReplies;
                showQRView('qr-edit-container');
            }
        });
        
        document.getElementById('btn-models-qr-toggle').addEventListener('click', () => {
            if (!document.getElementById('qr-models-container').classList.contains('hidden')) {
                showQRView('qr-button-container');
            } else {
                this.populateQRModelsUI();
                showQRView('qr-models-container');
            }
        });

        document.getElementById('btn-save-qr').addEventListener('click', () => {
            settings.quickReplies = document.getElementById('qr-edit-textarea').value;
            settings.save();
            this.openQuickReplies(); 
            showQRView('qr-button-container');
        });
        
        document.getElementById('qr-model-select-primary').addEventListener('change', (e) => {
            document.getElementById('qr-model-txt-primary').value = e.target.value;
        });

        document.getElementById('qr-model-select').addEventListener('change', (e) => this.loadQRModelConfig(e.target.value));
        document.getElementById('qr-model-enable').addEventListener('change', (e) => {
            if (e.target.checked) document.getElementById('qr-model-config').classList.remove('hidden');
            else document.getElementById('qr-model-config').classList.add('hidden');
        });
        document.getElementById('qr-model-count').addEventListener('change', () => this.renderQRModelRows());

        document.getElementById('btn-save-qr-models').addEventListener('click', () => {
            const title = document.getElementById('qr-model-select').value;
            if (!title) return;
            
            const count = parseInt(document.getElementById('qr-model-count').value) || 1;
            const overrides = [];
            for (let i = 0; i < count - 1; i++) {
                const chk = document.getElementById(`qr-override-chk-${i}`);
                const txt = document.getElementById(`qr-override-txt-${i}`);
                overrides.push({
                    enabled: chk ? chk.checked : false,
                    model: txt ? txt.value.trim() : ''
                });
            }
            
            settings.qrModels[title] = {
                enabled: document.getElementById('qr-model-enable').checked,
                draft1Model: document.getElementById('qr-model-txt-primary').value.trim(),
                count: count,
                overrides: overrides
            };
            settings.save();
            showQRView('qr-button-container');
        });

        // Choices & Brainstorming
        document.getElementById('btn-generate-choices').addEventListener('click', () => {
            document.getElementById('quick-menu').classList.add('hidden');
            document.getElementById('brainstorm-modal').classList.remove('hidden');
        });
        document.getElementById('btn-choices-settings').addEventListener('click', () => {
            if (window.settingsUI) window.settingsUI.populateChoicesUI();
            document.getElementById('choices-settings-modal').classList.remove('hidden');
        });

        // Brainstorming Modal Bindings
        document.getElementById('btn-close-brainstorm').addEventListener('click', () => document.getElementById('brainstorm-modal').classList.add('hidden'));
        
        document.getElementById('btn-bs-preset').addEventListener('click', () => {
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration();
        });

        const moodInput = document.getElementById('mood-input');
        moodInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = moodInput.value.trim().replace(/,/g, '');
                if (val && !this.moodTags.includes(val)) {
                    this.moodTags.push(val);
                    this.renderMoodTags();
                }
                moodInput.value = '';
            }
        });
        document.getElementById('btn-mood-random').addEventListener('click', () => {
            let available = this.hardcodedMoods.filter(m => !this.moodTags.includes(m));
            for (let i = 0; i < 3; i++) {
                if (available.length === 0) break;
                const idx = Math.floor(Math.random() * available.length);
                this.moodTags.push(available[idx]);
                available.splice(idx, 1);
            }
            this.renderMoodTags();
        });
        document.getElementById('btn-bs-mood').addEventListener('click', () => {
            if (moodInput.value.trim()) {
                this.moodTags.push(moodInput.value.trim());
                moodInput.value = '';
                this.renderMoodTags();
            }
            if (this.moodTags.length === 0) {
                document.getElementById('btn-mood-random').click();
            }
            const prompt = `Generate 5 ideas for what happens next matching the following styles: ${this.moodTags.join(', ')}.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-shift').addEventListener('click', () => {
            const prompt = `First, categorize the current scene along these axes: Mood/Tone, Emotional Charge, Narrative Pace/Tension, Agency/Power Balance.\nNow, choose **one** axis to deliberately shift to an adjacent category (e.g., Mood from Lighthearted to Eerie/Dramatic). Then generate 5 ideas for what happens next; for each briefly justify why that shift could naturally arise from the established story elements.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-tension').addEventListener('click', () => {
            const prompt = `Give me 3 options for what might happen next—one that raises tension, one that deepens character, and one that introduces a new element.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-reversal').addEventListener('click', () => {
            const char = document.getElementById('reversal-char-input').value.trim() || 'a character';
            const prompt = `Give me 5 ideas for how ${char} could do the opposite of what they would normally do, while providing a justification for each one.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-storm').addEventListener('click', () => {
            const prompt = `Give me 5 ideas for an overarching event that we can introduce that would provide a medium term goal to the story.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        // Apply Edits Core Events
        document.getElementById('btn-open-apply-edits').addEventListener('click', () => this.openApplyEdits());
        document.getElementById('btn-close-ae').addEventListener('click', () => document.getElementById('apply-edits-modal').classList.add('hidden'));
        document.getElementById('ae-filter-draft').addEventListener('change', () => this.renderApplyEditsList());
        document.getElementById('btn-ae-top').addEventListener('click', () => document.getElementById('ae-list-container').scrollTop = 0);

        // Edit Edit Events
        document.getElementById('btn-close-edit-edit').addEventListener('click', () => document.getElementById('edit-edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-edit-cancel').addEventListener('click', () => document.getElementById('edit-edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-edit-save').addEventListener('click', () => this.saveEditEdit());
        document.getElementById('edit-edit-textarea').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        document.getElementById('btn-edit-cancel').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-save').addEventListener('click', () => {
            const idx = parseInt(document.getElementById('btn-edit-save').dataset.idx);
            const newContent = document.getElementById('edit-message-content').value;
            const currentContent = this.state.getContent(idx);
            
            // Treat identically saved text as a Cancel so we don't wipe parallel drafts
            if (newContent === currentContent) {
                document.getElementById('edit-modal').classList.add('hidden');
                return;
            }
            
            this.state.editTurn(idx, newContent);
            document.getElementById('edit-modal').classList.add('hidden');
            this.renderAll();
            this.autoSave();
        });
        document.getElementById('btn-close-prompt').addEventListener('click', () => document.getElementById('prompt-modal').classList.add('hidden'));
        document.getElementById('btn-close-usage').addEventListener('click', () => document.getElementById('usage-modal').classList.add('hidden'));

        // Summary bindings
        document.getElementById('summary-meter-container').addEventListener('click', (e) => {
            if (e.target.id === 'btn-quick-summarize') this.startAutosummarize();
            else { this.updateSummaryMeterDetails(); document.getElementById('meter-details-modal').classList.remove('hidden'); }
        });
        document.getElementById('btn-close-meter-details').addEventListener('click', () => document.getElementById('meter-details-modal').classList.add('hidden'));
        document.getElementById('btn-run-autosummarize').addEventListener('click', () => {
            document.getElementById('chat-settings-modal').classList.add('hidden');
            this.startAutosummarize();
        });

        document.getElementById('btn-select-sum-prompt').addEventListener('click', () => this.openAutoSumPromptSelector());
        document.getElementById('btn-close-sum-prompt').addEventListener('click', () => document.getElementById('autosum-prompt-modal').classList.add('hidden'));
        document.getElementById('btn-edit-sum-prompt-toggle').addEventListener('click', () => {
            const isEditing = !document.getElementById('sum-prompt-edit-container').classList.contains('hidden');
            if (isEditing) {
                document.getElementById('sum-prompt-edit-container').classList.add('hidden');
                document.getElementById('sum-prompt-btn-container').classList.remove('hidden');
            } else {
                document.getElementById('sum-prompt-edit-textarea').value = settings.autoSummarizePrompts;
                document.getElementById('sum-prompt-edit-container').classList.remove('hidden');
                document.getElementById('sum-prompt-btn-container').classList.add('hidden');
            }
        });
        document.getElementById('btn-save-sum-prompts').addEventListener('click', () => {
            settings.autoSummarizePrompts = document.getElementById('sum-prompt-edit-textarea').value;
            settings.save();
            document.getElementById('sum-prompt-edit-container').classList.add('hidden');
            document.getElementById('sum-prompt-btn-container').classList.remove('hidden');
            this.openAutoSumPromptSelector(); 
        });

        document.getElementById('btn-close-autosum-stream').addEventListener('click', () => {
            if (this.activeSumJob) this.activeSumJob.cancel();
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-cancel').addEventListener('click', () => {
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-replace').addEventListener('click', () => {
            this.state.summary = document.getElementById('autosum-stream-output').value.trim();
            this.applySummarizeFlags();
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-append').addEventListener('click', () => {
            const output = document.getElementById('autosum-stream-output').value.trim();
            if (this.state.summary) this.state.summary += "\n\n" + output;
            else this.state.summary = output;
            this.applySummarizeFlags();
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-edit').addEventListener('click', () => {
            document.getElementById('autosum-stream-modal').classList.add('hidden');
            this.openMergeUI(document.getElementById('autosum-stream-output').value.trim());
        });

        document.getElementById('merge-page-selector').addEventListener('change', (e) => {
            const modal = document.getElementById('autosum-merge-modal');
            modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });
        document.getElementById('btn-close-autosum-merge').addEventListener('click', () => document.getElementById('autosum-merge-modal').classList.add('hidden'));
        document.getElementById('btn-merge-cancel').addEventListener('click', () => document.getElementById('autosum-merge-modal').classList.add('hidden'));
        document.getElementById('btn-merge-append').addEventListener('click', () => {
            const output = document.getElementById('autosum-stream-output').value.trim();
            if (this.state.summary) this.state.summary += "\n\n" + output;
            else this.state.summary = output;
            this.applySummarizeFlags();
            document.getElementById('autosum-merge-modal').classList.add('hidden');
        });
        document.getElementById('btn-merge-accept').addEventListener('click', () => {
            this.state.summary = document.getElementById('merge-preview-textarea').value.trim();
            this.applySummarizeFlags();
            document.getElementById('autosum-merge-modal').classList.add('hidden');
        });
    }

    handleRetry() {
        if (this.state.history.length === 0) return;
        const last = this.state.history[this.state.history.length - 1];
        if (last.role === 'assistant') {
            this.state.undo();
            this.renderAll();
            this.handleSend(true);
        }
    }

    async handleSend(isRetry = false) {
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

        const payloadObj = this.state.buildPromptPayload();
        
        // We capture original state because QR Models may temporarily spoof global settings
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
        
        // Restore settings immediately
        if (this.overrideNextSend) {
            settings.model = originalModel;
            settings.parallelEnabled = originalEnabled;
            settings.parallelCount = originalCount;
            settings.parallelOverrides = originalOverrides;
            this.overrideNextSend = null;
        }
        
        const newIdx = this.state.history.length;
        this.state.addBatchTurn(count, 'assistant');
        this.appendTurnToDOM('assistant', newIdx);
        
        if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
        this.batchStartTime = Date.now();
        this.batchTimerInterval = setInterval(() => {
            if (!this.activeBatch || this.activeBatch.isFinished) {
                clearInterval(this.batchTimerInterval);
                return;
            }
            const elapsed = ((Date.now() - this.batchStartTime)/1000).toFixed(1);
            
            this.activeBatch.jobs.forEach((job, i) => {
                if (job.status === 'streaming') {
                    const timerEl = document.getElementById(`batch-timer-${newIdx}-${i}`);
                    if (timerEl) timerEl.textContent = `(${elapsed}s)`;
                }
            });
        }, 100);

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                this.state.updateBatchDraft(newIdx, draftIdx, data);
                if (this.state.history[newIdx].activeDraftIndex === draftIdx) {
                    const contentNode = document.getElementById(`content-${newIdx}`);
                    const reasonNode = document.getElementById(`reasoning-${newIdx}`);
                    const reasonDiv = document.getElementById(`reasoning-block-${newIdx}`);
                    
                    if (data.reasoning) {
                        if (reasonNode) reasonNode.textContent = data.reasoning;
                        if (reasonDiv) {
                            reasonDiv.classList.remove('hidden');
                            if (data.status === 'streaming') reasonDiv.scrollTop = reasonDiv.scrollHeight;
                        }
                    }
                    if (contentNode) {
                        const draftObj = this.state.history[newIdx].drafts[draftIdx];
                        this.setNodeContent(contentNode, data.content, draftObj);
                    }
                    
                    if (!this.isUserScrolledUp) this.scrollToBottom();
                }

                const iconMap = { 'done':'✔️', 'error':'❌', 'streaming':'🕒' };
                const iconEl = document.getElementById(`draft-icon-${newIdx}-${draftIdx}`);
                if (iconEl) iconEl.textContent = iconMap[data.status] || '';
                
                if (data.status !== 'streaming') {
                    const timerEl = document.getElementById(`batch-timer-${newIdx}-${draftIdx}`);
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
            
            this.state.buildPromptPayload();
            this.appendTurnToDOM('assistant', newIdx);
            this.updateSummaryMeter();

            if (!this.isUserScrolledUp) this.scrollToBottom();
            this.autoSave();
        }
    }

    renderMoodTags() {
        const container = document.getElementById('mood-tags-container');
        container.innerHTML = '';
        this.moodTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'mood-pill';
            const text = document.createElement('span');
            text.textContent = tag;
            const btn = document.createElement('button');
            btn.innerHTML = '&times;';
            btn.onclick = () => {
                this.moodTags = this.moodTags.filter(t => t !== tag);
                this.renderMoodTags();
            };
            pill.appendChild(text);
            pill.appendChild(btn);
            container.appendChild(pill);
        });
    }

    async startChoicesGeneration(promptOverride = null) {
        if (this.activeBatch) return;

        document.getElementById('quick-menu').classList.add('hidden');
        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.isUserScrolledUp = false;

        const payloadObj = this.state.buildPromptPayload();
        
        let finalPrompt = promptOverride || settings.activeChoicePromptText;
        if (!finalPrompt.includes('<choice>')) {
            finalPrompt += '\n\nWrap each option in <choice> and </choice> tags.';
        }

        payloadObj.messages.push({ role: 'user', content: finalPrompt });

        const count = settings.choiceParallelEnabled ? parseInt(settings.choiceParallelCount) : 1;
        this.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, settings.choiceParallelOverrides);
        
        const newIdx = this.state.history.length;
        this.state.addBatchTurn(count, 'choices');
        this.appendTurnToDOM('choices', newIdx);

        if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
        this.batchStartTime = Date.now();
        this.batchTimerInterval = setInterval(() => {
            if (!this.activeBatch || this.activeBatch.isFinished) {
                clearInterval(this.batchTimerInterval);
                return;
            }
            const elapsed = ((Date.now() - this.batchStartTime)/1000).toFixed(1);
            this.activeBatch.jobs.forEach((job, i) => {
                if (job.status === 'streaming') {
                    const timerEl = document.getElementById(`choice-timer-${newIdx}-${i}`);
                    if (timerEl) timerEl.textContent = `(${elapsed}s)`;
                }
            });
        }, 100);

        try {
            await this.activeBatch.startAll((draftIdx, data) => {
                this.state.updateBatchDraft(newIdx, draftIdx, data);
                
                const iconMap = { 'done':'✔️', 'error':'❌', 'streaming':'🕒' };
                const iconEl = document.getElementById(`choice-icon-${newIdx}-${draftIdx}`);
                if (iconEl) iconEl.textContent = iconMap[data.status] || '';
                
                if (data.status !== 'streaming') {
                    const timerEl = document.getElementById(`choice-timer-${newIdx}-${draftIdx}`);
                    if (timerEl) timerEl.textContent = `(${data.duration}s)`;
                }
                if (!this.isUserScrolledUp) this.scrollToBottom();
            });
        } finally {
            if (this.batchTimerInterval) clearInterval(this.batchTimerInterval);
            this.activeBatch = null;

            const msg = this.state.history[newIdx];
            const choicesPool = [];
            const regex = /<choice>([\s\S]*?)<\/choice>/gi;
            
            msg.drafts.forEach(draft => {
                let match;
                while ((match = regex.exec(draft.content)) !== null) {
                    if (match[1].trim()) choicesPool.push(match[1].trim());
                }
            });

            if (choicesPool.length === 0) {
                msg.extractedChoices = ["Error: No <choice> tags found in AI response. Try editing the Choice Prompt to explicitly request <choice> tags."];
            } else {
                msg.extractedChoices = [...new Set(choicesPool)];
            }

            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            
            this.appendTurnToDOM('choices', newIdx);
            if (!this.isUserScrolledUp) this.scrollToBottom();
            this.autoSave();
        }
    }

    handleAbort() {
        if (this.activeBatch) this.activeBatch.cancelAll();
    }

    shouldUseMarkdown(content, draftOverride) {
        if (draftOverride !== undefined && draftOverride !== null) return draftOverride;
        return !/<(?:edit|old|new|reasoning)[>\s]/i.test(content) && settings.renderMarkdown;
    }

    setNodeContent(node, content, draft) {
        const visuallyApplied = settings.applyRegexes(content, 'visually');
        
        let htmlBlocks = [];
        let processed = visuallyApplied.replace(/<html>([\s\S]*?)<\/html>/gi, (m, inner) => {
            const clean = window.DOMPurify ? window.DOMPurify.sanitize(inner) : inner;
            htmlBlocks.push(clean);
            return `%%HTML_BLOCK_${htmlBlocks.length - 1}%%`;
        });

        processed = processed.replace(/<(\/?)([a-zA-Z][^>]*)>/g, '&lt;$1$2&gt;');

        if (this.shouldUseMarkdown(content, draft.markdownOverride)) {
            processed = marked.parse(processed);
            node.classList.add('markdown-body');
        } else {
            processed = processed.replace(/\n/g, '<br>');
            node.classList.remove('markdown-body');
        }

        htmlBlocks.forEach((block, i) => {
            processed = processed.replace(`%%HTML_BLOCK_${i}%%`, block);
        });

        node.innerHTML = processed;
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

        // Scroll Anchoring
        if (startIndex > 0 && this.historyOffset > 0 && oldScrollHeight > 0) {
            const newScrollHeight = this.container.scrollHeight;
            this.container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        } else if (!this.isUserScrolledUp) {
            this.scrollToBottom();
        }

        this.updateSummaryMeter();
    }

    buildSwitcherDOM(index, msg, isStreaming) {
        const switcher = document.createElement('div');
        switcher.className = `draft-switcher top`;
        switcher.id = `switcher-${index}`;
        
        const controlsRow = document.createElement('div');
        controlsRow.className = 'switcher-controls';

        const btnPrev = document.createElement('button');
        btnPrev.textContent = '◀';
        btnPrev.onclick = () => this.switchDraft(index, -1);
        
        const select = document.createElement('select');
        select.id = `draft-select-${index}`;
        
        msg.drafts.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            let modelStr = d.model;
            if (isStreaming && this.activeBatch && this.activeBatch.jobs[i]) {
                modelStr = this.activeBatch.jobs[i].model;
            }
            opt.textContent = `V${i+1} | ${modelStr ? modelStr.split('/').pop() : 'Unknown'}`;
            if (i === msg.activeDraftIndex) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e) => this.switchDraftExplicit(index, parseInt(e.target.value));

        const btnNext = document.createElement('button');
        btnNext.textContent = '▶';
        btnNext.onclick = () => this.switchDraft(index, 1);

        controlsRow.appendChild(btnPrev);
        controlsRow.appendChild(select);
        controlsRow.appendChild(btnNext);

        const statusRow = document.createElement('div');
        statusRow.className = 'switcher-status';
        
        msg.drafts.forEach((d, i) => {
            const spanGroup = document.createElement('span');
            
            const icon = document.createElement('span');
            icon.id = `draft-icon-${index}-${i}`;
            icon.textContent = d.status === 'done' ? '✔️' : (d.status === 'error' ? '❌' : '🕒');
            if (i === msg.activeDraftIndex) icon.classList.add('active-icon');
            
            const timer = document.createElement('span');
            timer.id = `batch-timer-${index}-${i}`;
            timer.style.marginLeft = '2px';
            if (!isStreaming || d.status !== 'streaming') {
                timer.textContent = `(${d.duration}s)`;
            }

            spanGroup.appendChild(icon);
            spanGroup.appendChild(timer);
            statusRow.appendChild(spanGroup);
        });

        switcher.appendChild(controlsRow);
        switcher.appendChild(statusRow);
        return switcher;
    }

    appendTurnToDOM(role, index) {
        const msg = this.state.history[index];
        const isStreaming = this.activeBatch && index === this.state.history.length - 1;
        const isLatestMessage = index === this.state.history.length - 1;
        const isOutOfContext = index <= this.state.contextBoundaryIndex;
        
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;
        if (isOutOfContext) wrapper.classList.add('out-of-context');
        wrapper.id = `turn-wrapper-${index}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';

        if (role === 'choices') {
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
                    this.startChoicesGeneration();
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
                wrapper.appendChild(this.buildSwitcherDOM(index, msg, isStreaming));
            }

            if (!isStreaming) {
                const actionBar = document.createElement('div');
                actionBar.className = 'action-bar';
                
                const metaSpan = document.createElement('span');
                if (activeDraft.model) {
                    const shortModel = activeDraft.model.split('/').pop();
                    metaSpan.textContent = `${shortModel} • ${activeDraft.duration}s`;
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

                const btnMd = document.createElement('span');
                btnMd.textContent = 'Ⓜ️';
                btnMd.className = 'md-toggle';
                btnMd.title = "Toggle Markdown";
                if (this.shouldUseMarkdown(content || '', activeDraft.markdownOverride)) btnMd.classList.add('active');
                btnMd.addEventListener('click', () => {
                    const currentlyOn = this.shouldUseMarkdown(activeDraft.content, activeDraft.markdownOverride);
                    activeDraft.markdownOverride = !currentlyOn;
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

                if (role === 'assistant' && activeDraft.usage) {
                    const btnUsage = document.createElement('span');
                    btnUsage.textContent = '📊';
                    btnUsage.title = "Token Usage";
                    btnUsage.addEventListener('click', () => {
                        document.getElementById('usage-prompt').textContent = activeDraft.usage.prompt_tokens || 0;
                        document.getElementById('usage-completion').textContent = activeDraft.usage.completion_tokens || 0;
                        document.getElementById('usage-total').textContent = activeDraft.usage.total_tokens || 0;
                        document.getElementById('usage-modal').classList.remove('hidden');
                    });
                    iconsDiv.appendChild(btnUsage);
                }

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
            this.setNodeContent(spanContent, content || '', activeDraft);
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

    switchDraft(msgIndex, dir) {
        const msg = this.state.history[msgIndex];
        const len = msg.drafts.length;
        const newIdx = (msg.activeDraftIndex + dir + len) % len;
        this.switchDraftExplicit(msgIndex, newIdx);
    }

    switchDraftExplicit(msgIndex, draftIdx) {
        this.state.setActiveDraft(msgIndex, draftIdx);
        
        const contentNode = document.getElementById(`content-${msgIndex}`);
        const reasonNode = document.getElementById(`reasoning-${msgIndex}`);
        const reasonDiv = document.getElementById(`reasoning-block-${msgIndex}`);
        
        const msg = this.state.history[msgIndex];
        const activeDraft = msg.drafts[draftIdx];

        if (contentNode) this.setNodeContent(contentNode, activeDraft.content, activeDraft);
        if (reasonNode) reasonNode.textContent = activeDraft.reasoning;
        
        if (reasonDiv) {
            if (activeDraft.reasoning) reasonDiv.classList.remove('hidden');
            else reasonDiv.classList.add('hidden');
        }

        const select = document.getElementById(`draft-select-${msgIndex}`);
        if (select) select.value = draftIdx;

        msg.drafts.forEach((_, i) => {
            const icon = document.getElementById(`draft-icon-${msgIndex}-${i}`);
            if (icon) {
                if (i === draftIdx) icon.classList.add('active-icon');
                else icon.classList.remove('active-icon');
            }
        });
        
        const topSwitcher = document.getElementById(`switcher-${msgIndex}`);
        if (topSwitcher) {
            topSwitcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // [Quick Replies logic stays exactly the same]
    openQuickReplies() {
        const container = document.getElementById('qr-button-container');
        container.innerHTML = '';
        const raw = settings.quickReplies || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const card = document.createElement('div');
            card.className = 'choice-card';
            card.style.flexDirection = 'row';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'space-between';
            card.style.padding = '8px 12px';
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = title;
            titleSpan.style.fontWeight = 'bold';
            titleSpan.title = content;
            
            const actions = document.createElement('div');
            actions.className = 'choice-card-actions';
            
            const btnInsert = document.createElement('button');
            btnInsert.textContent = '📝';
            btnInsert.title = 'Insert to input';
            btnInsert.onclick = () => {
                this.input.value = this.input.value ? this.input.value + ' ' + content : content;
                this.input.style.height = 'auto';
                this.input.style.height = (this.input.scrollHeight) + 'px';
                this.input.focus();
                document.getElementById('quick-replies-modal').classList.add('hidden');
            };
            
            const btnSend = document.createElement('button');
            btnSend.textContent = '🚀';
            btnSend.title = 'Send instantly';
            btnSend.onclick = () => {
                this.input.value = content;
                document.getElementById('quick-replies-modal').classList.add('hidden');
                const qrConfig = settings.qrModels?.[title];
                if (qrConfig && qrConfig.enabled) {
                    this.overrideNextSend = qrConfig;
                }
                this.handleSend();
            };
            
            actions.appendChild(btnInsert);
            actions.appendChild(btnSend);
            card.appendChild(titleSpan);
            card.appendChild(actions);
            container.appendChild(card);
        });
        document.getElementById('quick-replies-modal').classList.remove('hidden');
    }

    populateQRModelsUI() {
        const select = document.getElementById('qr-model-select');
        select.innerHTML = '';
        
        const raw = settings.quickReplies || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        if (parts.length === 0) {
            select.innerHTML = '<option value="">No Quick Replies found</option>';
            return;
        }
        
        parts.forEach(p => {
            const title = p.trim().split('\n')[0].trim();
            const opt = document.createElement('option');
            opt.value = title;
            opt.textContent = title;
            select.appendChild(opt);
        });
        
        this.loadQRModelConfig(select.value);
    }

    loadQRModelConfig(title) {
        const config = settings.qrModels?.[title] || { enabled: false, count: 1, draft1Model: '', overrides: [] };
        
        document.getElementById('qr-model-enable').checked = config.enabled;
        if (config.enabled) document.getElementById('qr-model-config').classList.remove('hidden');
        else document.getElementById('qr-model-config').classList.add('hidden');
        
        document.getElementById('qr-model-count').value = config.count || 1;
        document.getElementById('qr-model-txt-primary').value = config.draft1Model || '';
        
        this.currentQROverrides = config.overrides || [];
        this.renderQRModelRows();
    }

    renderQRModelRows() {
        const container = document.getElementById('qr-model-overrides-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('qr-model-count').value) || 1;
        
        for (let i = 0; i < count - 1; i++) {
            const ov = this.currentQROverrides[i] || { enabled: false, model: '' };
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            row.innerHTML = `
                <div class="batch-row-top">
                    <span>Draft ${i+2}</span>
                    <label style="flex-direction:row; align-items:center;">
                        <input type="checkbox" id="qr-override-chk-${i}" ${ov.enabled ? 'checked' : ''}> Override
                    </label>
                </div>
                <div class="batch-row-bottom">
                    <select id="qr-model-select-${i}"><option value="" disabled>Select model...</option></select>
                    <input type="text" id="qr-override-txt-${i}" value="${ov.model}" placeholder="Leave blank for default">
                </div>
            `;
            container.appendChild(row);

            document.getElementById(`qr-model-select-${i}`).addEventListener('change', (e) => {
                document.getElementById(`qr-override-txt-${i}`).value = e.target.value;
            });
        }
        
        if (window.settingsUI) window.settingsUI.updateAllModelDropdowns();
    }

    // [Apply Edits methods stay exactly the same]
    openApplyEdits() {
        if (this.state.history.length === 0) return alert("No messages available.");
        const lastMsg = this.state.history[this.state.history.length - 1];
        if (lastMsg.role !== 'assistant') return alert("Last message must be from the assistant to find edits.");

        const selectFilter = document.getElementById('ae-filter-draft');
        selectFilter.innerHTML = '<option value="All">All Drafts</option>';

        this.extractedEdits = [];
        const draftsToScan = lastMsg.isBatch ? lastMsg.drafts : [lastMsg.drafts[lastMsg.activeDraftIndex]];

        let editIdCounter = 0;

        draftsToScan.forEach((draft, idx) => {
            if (!draft.content) return;
            const shortModel = draft.model ? draft.model.split('/').pop() : 'Unknown';
            const draftLabel = `V${idx+1} | ${shortModel}`;
            
            if (lastMsg.isBatch) {
                const opt = document.createElement('option');
                opt.value = draftLabel;
                opt.textContent = draftLabel;
                selectFilter.appendChild(opt);
            }

            const regex = /(<edit>\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<reasoning>([\s\S]*?)<\/reasoning>\s*<\/edit>)/gi;
            let match;
            while ((match = regex.exec(draft.content)) !== null) {
                const oldText = match[2].trim();
                const newText = match[3].trim();
                if (oldText === newText) continue;

                this.extractedEdits.push({
                    id: editIdCounter++,
                    rawMatch: match[1],
                    oldText: oldText,
                    newText: newText,
                    reasoning: match[4].trim(),
                    sourceDraftIndex: idx,
                    sourceDraftLabel: draftLabel,
                    status: 'invalid',
                    score: 99999999,
                    targetMessageIdx: -1,
                    startIndex: -1,
                    endIndex: -1,
                    groupId: null
                });
            }
        });

        if (this.extractedEdits.length === 0) return alert("No valid <edit> tags found in the latest message.");

        this.evaluateEditsStatus();
        this.buildEditGroups();
        this.renderApplyEditsList();
        document.getElementById('apply-edits-modal').classList.remove('hidden');
    }

    evaluateEditsStatus() {
        const scanHistory = this.state.history.slice(-11, -1); 
        const startIndexOffset = Math.max(0, this.state.history.length - 11);

        this.extractedEdits.forEach(edit => {
            edit.status = 'invalid';
            edit.targetMessageIdx = -1;
            edit.startIndex = -1;
            edit.endIndex = -1;

            for (let i = scanHistory.length - 1; i >= 0; i--) {
                const content = this.state.getContent(startIndexOffset + i);
                
                const oldIdx = content.indexOf(edit.oldText);
                const newIdx = content.indexOf(edit.newText);
                const newIsSubOfOld = edit.oldText.includes(edit.newText);
                
                if (oldIdx !== -1) {
                    edit.status = 'apply';
                    edit.targetMessageIdx = startIndexOffset + i;
                    edit.startIndex = oldIdx;
                    edit.endIndex = oldIdx + edit.oldText.length;
                    edit.score = i * 100000 + oldIdx;
                    break;
                } else if (newIdx !== -1 && !newIsSubOfOld) {
                    edit.status = 'applied';
                    edit.targetMessageIdx = startIndexOffset + i;
                    edit.startIndex = newIdx;
                    edit.endIndex = newIdx + edit.newText.length;
                    edit.score = i * 100000 + newIdx;
                    break;
                }
            }
        });

        this.extractedEdits.sort((a, b) => a.score - b.score);
    }

    buildEditGroups() {
        this.extractedEdits.forEach(e => e.groupId = null);
        let currentGroupId = 1;

        const validEdits = this.extractedEdits.filter(e => e.status === 'apply').sort((a,b) => {
            if (a.targetMessageIdx !== b.targetMessageIdx) return a.targetMessageIdx - b.targetMessageIdx;
            return a.startIndex - b.startIndex;
        });

        const groups = [];
        validEdits.forEach(edit => {
            let placed = false;
            for (let g of groups) {
                if (g.msgIdx === edit.targetMessageIdx) {
                    if (Math.max(edit.startIndex, g.start) <= Math.min(edit.endIndex, g.end)) {
                        edit.groupId = g.id;
                        g.start = Math.min(g.start, edit.startIndex);
                        g.end = Math.max(g.end, edit.endIndex);
                        placed = true;
                        break;
                    }
                }
            }
            if (!placed) {
                edit.groupId = currentGroupId;
                groups.push({ id: currentGroupId, msgIdx: edit.targetMessageIdx, start: edit.startIndex, end: edit.endIndex });
                currentGroupId++;
            }
        });
        
        this.extractedEdits.forEach(e => {
            if (e.groupId === null) e.groupId = currentGroupId++;
        });
    }

    renderApplyEditsList() {
        const container = document.getElementById('ae-list-container');
        const st = container.scrollTop;
        container.innerHTML = '';
        
        const filter = document.getElementById('ae-filter-draft').value;

        const controls = document.createElement('div');
        controls.className = 'ae-controls-bar';
        
        const groupCb = document.createElement('label'); groupCb.className = 'ae-controls-group';
        groupCb.innerHTML = `<input type="checkbox" ${this.aeSettings.groupEdits ? 'checked' : ''}> Group Overlaps`;
        groupCb.querySelector('input').addEventListener('change', (e) => { this.aeSettings.groupEdits = e.target.checked; this.renderApplyEditsList(); });

        const collapseCb = document.createElement('label'); collapseCb.className = 'ae-controls-group';
        collapseCb.innerHTML = `<input type="checkbox" ${this.aeSettings.collapseReasoning ? 'checked' : ''}> Collapse Reasoning`;
        collapseCb.querySelector('input').addEventListener('change', (e) => { 
            this.aeSettings.collapseReasoning = e.target.checked; 
            this.extractedEdits.forEach(ed => ed.isCollapsed = this.aeSettings.collapseReasoning);
            this.renderApplyEditsList(); 
        });

        const invalidCb = document.createElement('label'); invalidCb.className = 'ae-controls-group';
        invalidCb.innerHTML = `<input type="checkbox" ${this.aeSettings.hideInvalid ? 'checked' : ''}> Hide Invalid`;
        invalidCb.querySelector('input').addEventListener('change', (e) => { this.aeSettings.hideInvalid = e.target.checked; this.renderApplyEditsList(); });

        const ctxDiv = document.createElement('div'); ctxDiv.className = 'ae-controls-group';
        ctxDiv.innerHTML = `
            <span>Context Chars:</span>
            <button id="ae-ctx-sub" class="secondary">-</button>
            <input type="number" id="ae-ctx-num" value="${this.aeSettings.contextChars}" min="0" max="100">
            <button id="ae-ctx-add" class="secondary">+</button>
        `;
        
        let ctxDebounce;
        const updateCtx = (val) => {
            this.aeSettings.contextChars = Math.max(0, parseInt(val) || 0);
            clearTimeout(ctxDebounce);
            ctxDebounce = setTimeout(() => this.renderApplyEditsList(), 200);
        };
        ctxDiv.querySelector('#ae-ctx-sub').addEventListener('click', () => updateCtx(this.aeSettings.contextChars - 5));
        ctxDiv.querySelector('#ae-ctx-add').addEventListener('click', () => updateCtx(this.aeSettings.contextChars + 5));
        ctxDiv.querySelector('#ae-ctx-num').addEventListener('change', (e) => updateCtx(e.target.value));

        controls.appendChild(groupCb);
        controls.appendChild(collapseCb);
        controls.appendChild(invalidCb);
        controls.appendChild(ctxDiv);
        container.appendChild(controls);

        const activeEdits = this.extractedEdits.filter(edit => {
            if (filter !== 'All' && edit.sourceDraftLabel !== filter) return false;
            if (this.aeSettings.hideInvalid && edit.status === 'invalid') return false;
            return true;
        });

        const renderedGroups = new Set();

        activeEdits.forEach(edit => {
            if (this.aeSettings.groupEdits && edit.groupId !== null) {
                if (renderedGroups.has(edit.groupId)) return;
                renderedGroups.add(edit.groupId);
                
                const groupEdits = activeEdits.filter(e => e.groupId === edit.groupId);
                if (groupEdits.length > 1) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'ae-group-wrapper';
                    wrapper.innerHTML = `<div class="ae-group-header">▼ GROUP: Overlapping Edits (${groupEdits.length})</div>`;
                    groupEdits.forEach(ge => wrapper.appendChild(this.buildEditCard(ge)));
                    container.appendChild(wrapper);
                } else {
                    container.appendChild(this.buildEditCard(groupEdits[0]));
                }
            } else {
                container.appendChild(this.buildEditCard(edit));
            }
        });
        
        container.scrollTop = st; 
    }

    buildEditCard(edit) {
        const card = document.createElement('div');
        card.className = 'ae-card';

        let preCtx = "", postCtx = "";
        if (edit.status === 'apply') {
            const targetContent = this.state.getContent(edit.targetMessageIdx);
            preCtx = targetContent.substring(Math.max(0, edit.startIndex - this.aeSettings.contextChars), edit.startIndex);
            postCtx = targetContent.substring(edit.endIndex, Math.min(targetContent.length, edit.endIndex + this.aeSettings.contextChars));
            preCtx = preCtx.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            postCtx = postCtx.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (preCtx) preCtx = `<span class="ae-context">${preCtx}</span>`;
            if (postCtx) postCtx = `<span class="ae-context">${postCtx}</span>`;
        }

        const diffs = diffWords(edit.oldText, edit.newText);
        
        let statusHtml = '';
        let buttonsHtml = '';

        if (edit.status === 'applied') {
            statusHtml = `<span class="ae-status applied">Already Applied</span>`;
        } else if (edit.status === 'invalid') {
            statusHtml = `<span class="ae-status invalid">Not Found</span>`;
        } else {
            buttonsHtml += `<button class="secondary modify-btn" style="padding: 4px 8px; margin-right: 4px; font-size: 0.85em;">✎ Modify</button>`;
            buttonsHtml += `<button class="primary apply-btn" style="padding: 4px 8px; font-size: 0.85em;">✔️ Apply</button>`;
        }

        edit.isCollapsed = edit.isCollapsed !== undefined ? edit.isCollapsed : this.aeSettings.collapseReasoning;
        
        card.innerHTML = `
            <div class="ae-reasoning-block">
                <span class="ae-reasoning-label">Reasoning ${edit.isCollapsed ? '[+]' : '[-]'}:</span>
                <span class="ae-reasoning-content ${edit.isCollapsed ? 'hidden' : ''}">${edit.reasoning.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
            </div>
            <div class="ae-diff-container">
                <div class="ae-diff-col">${preCtx}${diffs.oldHtml}${postCtx}</div>
                <div class="ae-diff-col">${preCtx}${diffs.newHtml}${postCtx}</div>
            </div>
            <div class="ae-footer">
                <span style="font-size:0.75em; color:var(--text-muted);">${edit.sourceDraftLabel}</span>
                <div class="ae-footer-actions">
                    ${statusHtml}
                    ${buttonsHtml}
                </div>
            </div>
        `;

        card.querySelector('.ae-reasoning-block').addEventListener('click', () => {
            edit.isCollapsed = !edit.isCollapsed;
            const label = card.querySelector('.ae-reasoning-label');
            const content = card.querySelector('.ae-reasoning-content');
            label.textContent = `Reasoning ${edit.isCollapsed ? '[+]' : '[-]'}:`;
            if (edit.isCollapsed) content.classList.add('hidden');
            else content.classList.remove('hidden');
        });

        if (edit.status === 'apply') {
            card.querySelector('.modify-btn').addEventListener('click', () => {
                this.openEditEditModal(edit, preCtx, postCtx);
            });
            card.querySelector('.apply-btn').addEventListener('click', () => {
                const targetContent = this.state.getContent(edit.targetMessageIdx);
                const updatedContent = targetContent.substring(0, edit.startIndex) + edit.newText + targetContent.substring(edit.endIndex);
                this.state.editTurn(edit.targetMessageIdx, updatedContent);
                this.state.buildPromptPayload(); 
                this.renderAll();
                this.autoSave();
                this.evaluateEditsStatus();
                this.renderApplyEditsList();
            });
        }
        return card;
    }

    openEditEditModal(edit, preCtx = "", postCtx = "") {
        this.currentEditEditing = edit;
        const diffs = diffWords(edit.oldText, edit.newText);
        
        document.getElementById('edit-edit-old-preview').innerHTML = `${preCtx}${diffs.oldHtml}${postCtx}`;
        document.getElementById('edit-edit-new-preview').innerHTML = `${preCtx}${diffs.newHtml}${postCtx}`;
        
        const ta = document.getElementById('edit-edit-textarea');
        ta.value = edit.newText;
        document.getElementById('edit-edit-modal').classList.remove('hidden');
        
        setTimeout(() => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            ta.focus();
        }, 10);
    }

    saveEditEdit() {
        if (!this.currentEditEditing) return;
        const edit = this.currentEditEditing;
        const newText = document.getElementById('edit-edit-textarea').value;
        
        const newRawMatch = `<edit>\n<old>${edit.oldText}</old>\n<new>${newText}</new>\n<reasoning>${edit.reasoning}</reasoning>\n</edit>`;
        
        const msgIdx = this.state.history.length - 1;
        const msg = this.state.history[msgIdx];
        if (msg && msg.drafts[edit.sourceDraftIndex]) {
            const draft = msg.drafts[edit.sourceDraftIndex];
            draft.content = draft.content.replace(edit.rawMatch, newRawMatch);
            
            if (msg.activeDraftIndex === edit.sourceDraftIndex) {
                const contentNode = document.getElementById(`content-${msgIdx}`);
                if (contentNode) this.setNodeContent(contentNode, draft.content, draft);
            }
        }
        
        edit.rawMatch = newRawMatch;
        edit.newText = newText;
        
        this.evaluateEditsStatus();
        this.renderApplyEditsList();
        this.autoSave();
        
        document.getElementById('edit-edit-modal').classList.add('hidden');
    }

    updateSummaryMeter() {
        const container = document.getElementById('summary-meter-container');
        if (!settings.trackSummary) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');

        const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
        const sysAnoteStr = this.state.systemPrompt.trim() + "\n" + this.state.anoteContent.trim();
        const maxResp = parseInt(settings.maxTokens);
        
        let sumCost = 0;
        if (this.state.summary.trim()) {
            sumCost = Math.ceil((this.state.summary.trim().length + 20) / charsRatio);
        }

        const maxContext = parseInt(settings.contextLength);
        const unchanging = Math.ceil(sysAnoteStr.length / charsRatio) + maxResp + sumCost;
        let budget = maxContext - unchanging;

        let summedCost = 0;
        let unsummedCost = 0;

        for (let i = this.state.history.length - 1; i >= 0; i--) {
            if (this.state.history[i].role === 'choices') continue;

            const msgContent = this.state.getContent(i);
            const T = Math.ceil(msgContent.length / charsRatio);
            if (budget - T >= 0) {
                budget -= T;
                if (this.state.history[i].wasSummarized) summedCost += T;
                else unsummedCost += T;
            } else {
                break;
            }
        }

        const availableBudget = maxContext - unchanging;
        let pct = 0;
        if (availableBudget > 0) {
            pct = Math.min(100, Math.round((unsummedCost / availableBudget) * 100));
        }

        const fill = document.getElementById('summary-meter-fill');
        const text = document.getElementById('summary-meter-text');
        fill.style.width = `${pct}%`;
        text.textContent = `${pct}%`;

        if (pct >= 90) fill.style.background = 'rgba(239, 68, 68, 0.6)'; 
        else if (pct >= 60) fill.style.background = 'rgba(234, 179, 8, 0.6)'; 
        else fill.style.background = 'rgba(59, 130, 246, 0.4)'; 
    }

    updateSummaryMeterDetails() {
        const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
        const memCost = Math.ceil(this.state.systemPrompt.trim().length / charsRatio);
        const anCost = Math.ceil(this.state.anoteContent.trim().length / charsRatio);
        let sumCost = this.state.summary.trim() ? Math.ceil((this.state.summary.trim().length + 20) / charsRatio) : 0;
        const maxResp = parseInt(settings.maxTokens);
        const maxContext = parseInt(settings.contextLength);
        const sysAnoteStr = this.state.systemPrompt.trim() + "\n" + this.state.anoteContent.trim();
        const unchanging = Math.ceil(sysAnoteStr.length / charsRatio) + maxResp + sumCost;
        
        let budget = maxContext - unchanging;
        let summedCost = 0;
        let unsummedCost = 0;

        for (let i = this.state.history.length - 1; i >= 0; i--) {
            if (this.state.history[i].role === 'choices') continue;

            const T = Math.ceil(this.state.getContent(i).length / charsRatio);
            if (budget - T >= 0) {
                budget -= T;
                if (this.state.history[i].wasSummarized) summedCost += T;
                else unsummedCost += T;
            } else break;
        }

        document.getElementById('meter-stat-max').textContent = maxContext;
        document.getElementById('meter-stat-resp').textContent = maxResp;
        document.getElementById('meter-stat-mem').textContent = memCost;
        document.getElementById('meter-stat-an').textContent = anCost;
        document.getElementById('meter-stat-sum').textContent = sumCost;
        document.getElementById('meter-stat-budget').textContent = maxContext - unchanging;
        document.getElementById('meter-stat-summed').textContent = summedCost;
        document.getElementById('meter-stat-unsummed').textContent = unsummedCost;
    }

    openAutoSumPromptSelector() {
        const container = document.getElementById('sum-prompt-btn-container');
        container.innerHTML = '';
        const raw = settings.autoSummarizePrompts || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const btn = document.createElement('button');
            btn.className = 'secondary';
            if (this.state.selectedAutoSumPromptTitle === title) btn.classList.add('primary');
            btn.textContent = title;
            btn.title = content;
            btn.addEventListener('click', () => {
                this.state.selectedAutoSumPromptTitle = title;
                this.state.selectedAutoSumPromptText = content;
                document.getElementById('lbl-active-sum-prompt').textContent = title;
                document.getElementById('autosum-prompt-modal').classList.add('hidden');
                this.autoSave();
            });
            container.appendChild(btn);
        });
        document.getElementById('autosum-prompt-modal').classList.remove('hidden');
    }

    async startAutosummarize() {
        const payloadObj = this.state.buildPromptPayload(true, this.state.selectedAutoSumPromptText);
        this.sumTargetIndices = payloadObj.includedIndices; 

        document.getElementById('autosum-stream-title').textContent = "Generating Summary...";
        document.getElementById('btn-close-autosum-stream').classList.remove('hidden');
        document.getElementById('autosum-resolution-btns').classList.add('hidden');
        
        const outputArea = document.getElementById('autosum-stream-output');
        outputArea.value = "";
        document.getElementById('autosum-stream-modal').classList.remove('hidden');

        let model = settings.summarizeModel || settings.model;
        this.activeSumJob = new GenerationJob(model);
        
        try {
            await this.activeSumJob.start(payloadObj.messages, () => {
                outputArea.value = this.activeSumJob.finalContent;
                outputArea.scrollTop = outputArea.scrollHeight;
            });
        } finally {
            this.activeSumJob = null;
            document.getElementById('autosum-stream-title').textContent = "Summary Generation Complete";
            document.getElementById('btn-close-autosum-stream').classList.add('hidden');
            document.getElementById('autosum-resolution-btns').classList.remove('hidden');
        }
    }

    applySummarizeFlags() {
        this.sumTargetIndices.forEach(idx => {
            if (this.state.history[idx]) {
                this.state.history[idx].wasSummarized = true;
            }
        });
        if (window.settingsUI) window.settingsUI.populateUI();
        this.updateSummaryMeter();
        this.autoSave();
    }

    openMergeUI(newSummary) {
        const oldSummary = this.state.summary.trim();
        const container = document.getElementById('merge-list-container');
        container.innerHTML = '';
        const diffs = diffLines(oldSummary, newSummary);
        this.mergeLines = [];

        diffs.forEach(diff => {
            if (!diff.value.trim()) return; 

            const label = document.createElement('label');
            label.className = `merge-line`;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;

            if (diff.type === 'delete') {
                label.classList.add('merge-old');
                label.title = "Old Summary";
            } else if (diff.type === 'insert') {
                label.classList.add('merge-new');
                label.title = "New Summary";
            } else {
                label.classList.add('merge-equal');
                label.title = "Overlap / Unchanged";
            }

            const span = document.createElement('span');
            span.textContent = diff.value;
            checkbox.addEventListener('change', () => this.updateMergePreview());
            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
            this.mergeLines.push({ checkbox, text: diff.value });
        });

        const mergeModal = document.getElementById('autosum-merge-modal');
        mergeModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById('merge-tab-edit').classList.add('active');
        document.getElementById('merge-page-selector').value = 'merge-tab-edit';

        this.updateMergePreview();
        mergeModal.classList.remove('hidden');
    }

    updateMergePreview() {
        const out = this.mergeLines.filter(l => l.checkbox.checked).map(l => l.text).join('\n');
        document.getElementById('merge-preview-textarea').value = out;
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
        document.getElementById('btn-jump-bottom').classList.add('hidden');
    }

    async autoSave() {
        await this.storage.saveSlot(this.activeSlot, this.activeSlotName, this.activeSlotDesc, this.state.exportData());
        localStorage.setItem('last_active_slot', this.activeSlot);
        if (window.settingsUI) window.settingsUI.refreshSlotList();
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