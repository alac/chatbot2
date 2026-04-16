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
        this.batchTimerInterval = null;
        this.batchStartTime = 0;
        
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');
        
        this.isUserScrolledUp = false;
        this.extractedEdits = [];
        this.activeSumJob = null;
        this.sumTargetIndices = [];

        // Apply Edits Settings
        this.aeSettings = {
            groupEdits: true,
            collapseReasoning: true,
            hideInvalid: false,
            contextChars: 10
        };
        this.currentEditEditing = null;

        this.bindEvents();
        this.initApp();
    }

    async initApp() {
        await this.storage.init();
        const lastSlot = localStorage.getItem('last_active_slot') || 1;
        this.activeSlot = parseInt(lastSlot);
        await this.loadStateFromSlot(this.activeSlot);
        
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
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSend(); }
        });

        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = (this.input.scrollHeight) + 'px';
        });

        document.addEventListener('keydown', (e) => {
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
        document.getElementById('btn-edit-qr-toggle').addEventListener('click', () => {
            const isEditing = !document.getElementById('qr-edit-container').classList.contains('hidden');
            if (isEditing) {
                document.getElementById('qr-edit-container').classList.add('hidden');
                document.getElementById('qr-button-container').classList.remove('hidden');
            } else {
                document.getElementById('qr-edit-textarea').value = settings.quickReplies;
                document.getElementById('qr-edit-container').classList.remove('hidden');
                document.getElementById('qr-button-container').classList.add('hidden');
            }
        });
        document.getElementById('btn-save-qr').addEventListener('click', () => {
            settings.quickReplies = document.getElementById('qr-edit-textarea').value;
            settings.save();
            document.getElementById('qr-edit-container').classList.add('hidden');
            document.getElementById('qr-button-container').classList.remove('hidden');
            this.openQuickReplies(); 
        });

        // Choices
        document.getElementById('btn-generate-choices').addEventListener('click', () => this.startChoicesGeneration());
        document.getElementById('btn-choices-settings').addEventListener('click', () => {
            if (window.settingsUI) window.settingsUI.populateChoicesUI();
            document.getElementById('choices-settings-modal').classList.remove('hidden');
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
            this.state.editTurn(idx, document.getElementById('edit-message-content').value);
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

        const oldTop = document.getElementById(`switcher-top-${this.state.history.length - 1}`);
        const oldBot = document.getElementById(`switcher-bottom-${this.state.history.length - 1}`);
        if (oldTop) oldTop.remove();
        if (oldBot) oldBot.remove();

        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.isUserScrolledUp = false;

        const payloadObj = this.state.buildPromptPayload();
        const count = settings.parallelEnabled ? parseInt(settings.parallelCount) : 1;
        this.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, settings.parallelOverrides);
        
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
                    const tTop = document.getElementById(`batch-timer-top-${newIdx}-${i}`);
                    const tBot = document.getElementById(`batch-timer-bottom-${newIdx}-${i}`);
                    if (tTop) tTop.textContent = `(${elapsed}s)`;
                    if (tBot) tBot.textContent = `(${elapsed}s)`;
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
                const iTop = document.getElementById(`draft-icon-top-${newIdx}-${draftIdx}`);
                const iBot = document.getElementById(`draft-icon-bottom-${newIdx}-${draftIdx}`);
                if (iTop) iTop.textContent = iconMap[data.status] || '';
                if (iBot) iBot.textContent = iconMap[data.status] || '';
                
                if (data.status !== 'streaming') {
                    const tTop = document.getElementById(`batch-timer-top-${newIdx}-${draftIdx}`);
                    const tBot = document.getElementById(`batch-timer-bottom-${newIdx}-${draftIdx}`);
                    if (tTop) tTop.textContent = `(${data.duration}s)`;
                    if (tBot) tBot.textContent = `(${data.duration}s)`;
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
            this.input.focus();
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            
            this.state.buildPromptPayload();
            this.appendTurnToDOM('assistant', newIdx);
            this.updateSummaryMeter();

            if (!this.isUserScrolledUp) this.scrollToBottom();
            this.autoSave();
        }
    }

    async startChoicesGeneration() {
        if (this.activeBatch) return;

        document.getElementById('quick-menu').classList.add('hidden');
        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.isUserScrolledUp = false;

        const payloadObj = this.state.buildPromptPayload();
        payloadObj.messages.push({ role: 'user', content: settings.activeChoicePromptText });

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

            // Extract choices across all drafts
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
            // Failsafe if DOMPurify failed to load over CDN
            const clean = window.DOMPurify ? window.DOMPurify.sanitize(inner) : inner;
            htmlBlocks.push(clean);
            return `%%HTML_BLOCK_${htmlBlocks.length - 1}%%`;
        });

        // Escape any remaining <tag> format to text (excluding our placeholders)
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
        this.container.innerHTML = '';
        this.container.className = `${settings.displayMode}-mode`;
        this.state.history.forEach((turn, idx) => {
            if (idx === this.state.contextBoundaryIndex + 1) {
                const divider = document.createElement('div');
                divider.className = 'context-divider';
                divider.textContent = 'Context Boundary';
                this.container.appendChild(divider);
            }
            this.appendTurnToDOM(turn.role, idx);
        });
        if (!this.isUserScrolledUp) this.scrollToBottom();
        this.updateSummaryMeter();
    }

    buildSwitcherDOM(index, isTop, msg, isStreaming) {
        const switcher = document.createElement('div');
        switcher.className = `draft-switcher ${isTop ? 'top' : 'bottom'}`;
        switcher.id = `switcher-${isTop ? 'top' : 'bottom'}-${index}`;
        
        const controlsRow = document.createElement('div');
        controlsRow.className = 'switcher-controls';

        const btnPrev = document.createElement('button');
        btnPrev.textContent = '◀';
        btnPrev.onclick = () => this.switchDraft(index, -1);
        
        const select = document.createElement('select');
        select.id = `draft-select-${isTop ? 'top' : 'bottom'}-${index}`;
        
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
            icon.id = `draft-icon-${isTop ? 'top' : 'bottom'}-${index}-${i}`;
            icon.textContent = d.status === 'done' ? '✔️' : (d.status === 'error' ? '❌' : '🕒');
            if (i === msg.activeDraftIndex) icon.classList.add('active-icon');
            
            const timer = document.createElement('span');
            timer.id = `batch-timer-${isTop ? 'top' : 'bottom'}-${index}-${i}`;
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
                // Streaming visual for choices
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
                // Render finished choices
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
            // Normal Assistant/User behavior
            const activeDraft = msg.drafts[msg.activeDraftIndex];
            const content = activeDraft.content;
            const reasoning = activeDraft.reasoning;

            if (msg.isBatch && msg.drafts.length > 1 && isLatestMessage) {
                wrapper.appendChild(this.buildSwitcherDOM(index, true, msg, isStreaming));
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

        // Inject Bottom Switcher if normal assistant batch
        if (role === 'assistant' && msg.isBatch && msg.drafts.length > 1 && isLatestMessage) {
            wrapper.appendChild(this.buildSwitcherDOM(index, false, msg, isStreaming));
        }

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

        ['top', 'bottom'].forEach(pos => {
            const select = document.getElementById(`draft-select-${pos}-${msgIndex}`);
            if (select) select.value = draftIdx;

            msg.drafts.forEach((_, i) => {
                const icon = document.getElementById(`draft-icon-${pos}-${msgIndex}-${i}`);
                if (icon) {
                    if (i === draftIdx) icon.classList.add('active-icon');
                    else icon.classList.remove('active-icon');
                }
            });
        });

        const topSwitcher = document.getElementById(`switcher-top-${msgIndex}`);
        if (topSwitcher) {
            topSwitcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    openQuickReplies() {
        const container = document.getElementById('qr-button-container');
        container.innerHTML = '';
        
        const raw = settings.quickReplies || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const btn = document.createElement('button');
            btn.className = 'primary';
            btn.textContent = title;
            btn.title = content;
            btn.addEventListener('click', () => {
                this.input.value = content;
                document.getElementById('quick-replies-modal').classList.add('hidden');
                this.input.style.height = 'auto';
                this.input.style.height = (this.input.scrollHeight) + 'px';
                this.input.focus();
            });
            container.appendChild(btn);
        });

        document.getElementById('quick-replies-modal').classList.remove('hidden');
    }

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

                // FIX: Exclude pairs where NEW == OLD
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

        // Group only 'apply' edits since they share a clear spatial index
        const validEdits = this.extractedEdits.filter(e => e.status === 'apply').sort((a,b) => {
            if (a.targetMessageIdx !== b.targetMessageIdx) return a.targetMessageIdx - b.targetMessageIdx;
            return a.startIndex - b.startIndex;
        });

        const groups = [];
        validEdits.forEach(edit => {
            let placed = false;
            for (let g of groups) {
                if (g.msgIdx === edit.targetMessageIdx) {
                    // Check for overlap
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
        
        // Give independent groups to applied/invalid edits
        this.extractedEdits.forEach(e => {
            if (e.groupId === null) e.groupId = currentGroupId++;
        });
    }

    renderApplyEditsList() {
        const container = document.getElementById('ae-list-container');
        const st = container.scrollTop;
        container.innerHTML = '';
        
        const filter = document.getElementById('ae-filter-draft').value;

        // --- Render Control Bar ---
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

        // --- Render Edits ---
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

        // Reasoning Toggle Logic
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
        
        // Build the updated XML block
        const newRawMatch = `<edit>\n<old>${edit.oldText}</old>\n<new>${newText}</new>\n<reasoning>${edit.reasoning}</reasoning>\n</edit>`;
        
        // Find the specific draft in history to update its raw content
        const msgIdx = this.state.history.length - 1;
        const msg = this.state.history[msgIdx];
        if (msg && msg.drafts[edit.sourceDraftIndex]) {
            const draft = msg.drafts[edit.sourceDraftIndex];
            draft.content = draft.content.replace(edit.rawMatch, newRawMatch);
            
            // Re-render chat container if it happens to be the active draft visually
            if (msg.activeDraftIndex === edit.sourceDraftIndex) {
                const contentNode = document.getElementById(`content-${msgIdx}`);
                if (contentNode) this.setNodeContent(contentNode, draft.content, draft);
            }
        }
        
        // Update the extracted edit object
        edit.rawMatch = newRawMatch;
        edit.newText = newText;
        
        // Re-eval statuses and refresh the list
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
        await this.storage.saveSlot(this.activeSlot, `Slot ${this.activeSlot}`, `Auto-saved`, this.state.exportData());
        localStorage.setItem('last_active_slot', this.activeSlot);
        if (window.settingsUI) window.settingsUI.refreshSlotList();
    }

    async loadStateFromSlot(id) {
        this.activeSlot = id;
        localStorage.setItem('last_active_slot', id);
        
        const slot = await this.storage.loadSlot(id);
        if (slot && slot.data) {
            this.state.loadFromData(slot.data);
            document.getElementById('set-display-mode').value = settings.displayMode;
            if (document.getElementById('lbl-active-sum-prompt')) {
                document.getElementById('lbl-active-sum-prompt').textContent = this.state.selectedAutoSumPromptTitle;
            }
        } else {
            this.state.clear(true); 
        }
        this.state.buildPromptPayload();
        this.renderAll();
    }
}
