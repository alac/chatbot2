import { StoryState } from '../state/StoryState.js';
import { diffWords } from '../utils/diff.js';
import { settings } from '../state/AppSettings.js';

export class DirectorManager {
    constructor(app) {
        this.app = app;
        this.isActive = false;
        this.mainStoryState = null;
        
        this.targetIndex = -1;
        this.currentSessionPrior = 0;

        // Default Director Settings
        this.settings = {
            priorContextCount: 3,
            memory: {
                behavior: 'override',
                text: "You are an expert narrative editor helping the author polish this specific passage. Do not continue the forward plot. Output requested revisions or provide proposed changes. You may use <edit> blocks or output new drafts entirely."
            },
            anote: {
                behavior: 'default',
                text: ""
            },
            summary: {
                behavior: 'default',
                text: ""
            }
        };

        this.activeEditingChannel = null;
        this._pendingInterior = [];
        this._pendingExtended = [];
        this._interiorDiffs = [];
        this._extendedCheckboxes = [];

        this.loadSettings();
        this.bindEvents();
    }

    loadSettings() {
        const saved = localStorage.getItem('ai_proto_director_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Migrate from legacy schema if present
                if (parsed.overrideSystemPrompt !== undefined && !parsed.memory) {
                    this.settings.memory = {
                        behavior: parsed.overrideSystemPrompt ? 'override' : 'default',
                        text: parsed.customSystemPrompt || this.settings.memory.text
                    };
                }
                if (parsed.includeSummary !== undefined && !parsed.summary) {
                    this.settings.summary = {
                        behavior: parsed.includeSummary ? 'default' : 'none',
                        text: ''
                    };
                }
                if (!parsed.anote) {
                    this.settings.anote = { behavior: 'default', text: '' };
                }
                Object.assign(this.settings, parsed);
                if (!this.settings.memory) this.settings.memory = { behavior: 'override', text: '' };
                if (!this.settings.anote) this.settings.anote = { behavior: 'default', text: '' };
                if (!this.settings.summary) this.settings.summary = { behavior: 'default', text: '' };
            } catch (e) {
                console.error("Error loading director settings:", e);
            }
        }
    }

    saveSettings() {
        localStorage.setItem('ai_proto_director_settings', JSON.stringify(this.settings));
    }


    bindEvents() {
        document.getElementById('btn-director-settings').addEventListener('click', () => this.openSettingsModal());
        document.getElementById('btn-director-exit').addEventListener('click', () => this.exit());
        
        // Director Settings Modal
        document.getElementById('btn-close-director-settings').addEventListener('click', () => document.getElementById('director-settings-modal').classList.add('hidden'));
        document.getElementById('btn-dir-edit-memory').addEventListener('click', () => this.openChannelModal('memory'));
        document.getElementById('btn-dir-edit-anote').addEventListener('click', () => this.openChannelModal('anote'));
        document.getElementById('btn-dir-edit-summary').addEventListener('click', () => this.openChannelModal('summary'));

        document.getElementById('btn-save-director-settings').addEventListener('click', () => {
            const newPrior = Math.max(0, parseInt(document.getElementById('dir-set-prior').value) || 0);

            if (this.isActive) {
                if (newPrior < this.currentSessionPrior) {
                    alert("Shrinking context mid-session risks losing edits to earlier turns. Please review/commit or discard your current session first.");
                    document.getElementById('dir-set-prior').value = this.currentSessionPrior;
                    return;
                } else if (newPrior > this.currentSessionPrior) {
                    // Extending in-place
                    const currentMinOrigin = this.app.state.history.length > 0 && this.app.state.history[0]._originIndex !== undefined
                        ? this.app.state.history[0]._originIndex 
                        : this.targetIndex;

                    const desiredStartIdx = Math.max(0, this.targetIndex - newPrior);
                    
                    if (desiredStartIdx < currentMinOrigin) {
                        const sliceToPrepend = structuredClone(this.mainStoryState.history.slice(desiredStartIdx, currentMinOrigin));
                        sliceToPrepend.forEach((turn, localIdx) => {
                            const originalIndex = desiredStartIdx + localIdx;
                            turn._originIndex = originalIndex;
                            turn._isTargetTurn = false;
                            if (turn.drafts && turn.drafts[turn.activeDraftIndex]) {
                                turn._originalContentSnapshot = turn.drafts[turn.activeDraftIndex].content;
                            }
                        });
                        
                        this.app.state.history.unshift(...sliceToPrepend);
                        this.currentSessionPrior = this.targetIndex - desiredStartIdx;
                        this.startIdx = desiredStartIdx;
                        this.originalSpanLength = this.targetIndex - this.startIdx + 1;
                    }
                }

                this.applyChannelSettingsToSandbox(this.app.state);
                this.app.state.buildPromptPayload();
                this.app.renderAll();
            }

            this.settings.priorContextCount = newPrior;
            this.saveSettings();
            
            document.getElementById('director-settings-modal').classList.add('hidden');
        });

        // Channel Editor Sub-Modal
        document.getElementById('btn-close-dir-channel').addEventListener('click', () => this.closeChannelModal());
        document.getElementById('btn-dir-channel-cancel').addEventListener('click', () => this.closeChannelModal());
        document.getElementById('btn-dir-channel-paste-default').addEventListener('click', () => {
            if (!this.activeEditingChannel) return;
            const parentVal = this.getParentChannelValue(this.activeEditingChannel);
            document.getElementById('dir-channel-textarea').value = parentVal.text;
        });

        document.getElementById('btn-dir-channel-save').addEventListener('click', () => {
            if (!this.activeEditingChannel) return;
            const behavior = document.getElementById('dir-channel-behavior').value;
            const text = document.getElementById('dir-channel-textarea').value;

            this.settings[this.activeEditingChannel] = { behavior, text };
            this.saveSettings();
            this.updateSettingsBadges();

            if (this.isActive) {
                this.applyChannelSettingsToSandbox(this.app.state);
                this.app.state.buildPromptPayload();
                this.app.renderAll();
            }

            this.closeChannelModal();
        });

        // Review Modal
        document.getElementById('btn-close-director-review').addEventListener('click', () => document.getElementById('director-review-modal').classList.add('hidden'));
        document.getElementById('btn-dir-review-keep-editing').addEventListener('click', () => document.getElementById('director-review-modal').classList.add('hidden'));
        document.getElementById('btn-dir-review-discard').addEventListener('click', () => {
            if (confirm("Throw away all changes and exit Director Mode?")) {
                document.getElementById('director-review-modal').classList.add('hidden');
                this.discard();
            }
        });
        document.getElementById('btn-dir-review-commit').addEventListener('click', () => {
            this.commit();
            document.getElementById('director-review-modal').classList.add('hidden');
        });
    }

    openSettingsModal() {
        document.getElementById('dir-set-prior').value = this.settings.priorContextCount;
        this.updateSettingsBadges();
        document.getElementById('director-settings-modal').classList.remove('hidden');
    }

    updateSettingsBadges() {
        const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Default';
        const bMem = document.getElementById('dir-badge-memory');
        const bAn = document.getElementById('dir-badge-anote');
        const bSum = document.getElementById('dir-badge-summary');

        if (bMem && this.settings.memory) bMem.textContent = capitalize(this.settings.memory.behavior);
        if (bAn && this.settings.anote) bAn.textContent = capitalize(this.settings.anote.behavior);
        if (bSum && this.settings.summary) bSum.textContent = capitalize(this.settings.summary.behavior);
    }

    openChannelModal(channelKey) {
        this.activeEditingChannel = channelKey;
        const titles = {
            memory: 'Edit Memory (System Prompt)',
            anote: "Edit Author's Note",
            summary: 'Edit Story Summary'
        };
        document.getElementById('dir-channel-modal-title').textContent = titles[channelKey] || 'Edit Channel';

        const config = this.settings[channelKey] || { behavior: 'default', text: '' };
        document.getElementById('dir-channel-behavior').value = config.behavior || 'default';
        document.getElementById('dir-channel-textarea').value = config.text || '';

        document.getElementById('dir-channel-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('dir-channel-textarea').focus(), 50);
    }

    closeChannelModal() {
        document.getElementById('dir-channel-modal').classList.add('hidden');
        this.activeEditingChannel = null;
    }

    getParentChannelValue(channelKey) {
        const parent = this.mainStoryState || this.app.state;
        if (!parent) return { text: '', disabled: false };
        if (channelKey === 'memory') {
            return { text: parent.systemPrompt || '', disabled: !!parent.disableMemory };
        } else if (channelKey === 'anote') {
            return { text: parent.anoteContent || '', disabled: false };
        } else if (channelKey === 'summary') {
            return { text: parent.summary || '', disabled: !!parent.disableSummary };
        }
        return { text: '', disabled: false };
    }

    computeEffectiveChannel(channelKey) {
        const config = this.settings[channelKey] || { behavior: 'default', text: '' };
        const parentVal = this.getParentChannelValue(channelKey);
        const customText = (config.text || '').trim();
        const parentText = (parentVal.text || '').trim();
        const behavior = config.behavior || 'default';

        if (behavior === 'none') {
            return { text: '', disabled: true };
        }
        if (behavior === 'default') {
            return { text: parentVal.text, disabled: parentVal.disabled };
        }
        if (behavior === 'override') {
            return { text: config.text || '', disabled: false };
        }
        if (behavior === 'prefix') {
            const combined = customText ? (parentText ? `${customText}\n\n${parentText}` : customText) : parentText;
            return { text: combined, disabled: false };
        }
        if (behavior === 'suffix') {
            const combined = customText ? (parentText ? `${parentText}\n\n${customText}` : customText) : parentText;
            return { text: combined, disabled: false };
        }
        return { text: parentVal.text, disabled: parentVal.disabled };
    }

    applyChannelSettingsToSandbox(sandbox) {
        const mem = this.computeEffectiveChannel('memory');
        sandbox.systemPrompt = mem.text;
        sandbox.disableMemory = mem.disabled;

        const an = this.computeEffectiveChannel('anote');
        sandbox.anoteContent = an.text;

        const sum = this.computeEffectiveChannel('summary');
        sandbox.summary = sum.text;
        sandbox.disableSummary = sum.disabled;
    }

    enter(targetIndex) {
        if (this.isActive) return;

        this.targetIndex = targetIndex;
        this.currentSessionPrior = this.settings.priorContextCount;

        this.mainStoryState = this.app.state;
        const mainHistory = this.mainStoryState.history;
        
        // Calculate Slice Bounds (No Post-Context. Target Index is the end of the history)
        const startIdx = Math.max(0, targetIndex - this.settings.priorContextCount);
        const endIdx = targetIndex; 

        // Deep clone the slice
        const clonedSlice = structuredClone(mainHistory.slice(startIdx, endIdx + 1));
        
        // Annotate the slice with origin data
        clonedSlice.forEach((turn, localIdx) => {
            const originalIndex = startIdx + localIdx;
            turn._originIndex = originalIndex;
            turn._isTargetTurn = (originalIndex === targetIndex);
            
            // Snapshot the active content so we can diff it later
            if (turn.drafts && turn.drafts[turn.activeDraftIndex]) {
                turn._originalContentSnapshot = turn.drafts[turn.activeDraftIndex].content;
            }
        });

        // Initialize Sandbox State
        const sandboxState = new StoryState();
        sandboxState.loadFromData(this.mainStoryState.exportData());
        sandboxState.history = clonedSlice;
        
        this.applyChannelSettingsToSandbox(sandboxState);

        // Perform the Swap
        this.app.state = sandboxState;
        this.isActive = true;
        
        // Swap Header UI
        document.getElementById('avatar-container').classList.add('hidden');
        document.getElementById('nanogpt-meter').classList.add('hidden');
        document.getElementById('summary-meter-container').classList.add('hidden');
        document.getElementById('btn-open-timeline').classList.add('hidden');
        
        const dirGroup = document.getElementById('director-nav-group');
        document.getElementById('director-badge').textContent = `🎬 Turn #${targetIndex + 1}`;
        dirGroup.classList.remove('hidden');

        // Render
        this.app.state.buildPromptPayload();
        this.app.renderAll();

        // Scroll directly to target turn
        const localTargetIndex = targetIndex - startIdx;
        setTimeout(() => {
            const targetEl = document.getElementById(`turn-wrapper-${localTargetIndex}`);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
    }

    exit() {
        if (!this.isActive) return;

        const modifications = [];
        const newTurns = [];

        this.app.state.history.forEach(turn => {
            if (turn._originIndex !== undefined && turn.drafts && turn.drafts[turn.activeDraftIndex]) {
                const currentContent = turn.drafts[turn.activeDraftIndex].content;
                if (currentContent !== turn._originalContentSnapshot) {
                    modifications.push({
                        turn: turn,
                        oldText: turn._originalContentSnapshot || '',
                        newText: currentContent || ''
                    });
                }
            } else if (turn._originIndex === undefined) {
                // Generated / injected turns inside the sandbox
                newTurns.push(turn);
            }
        });

        if (modifications.length === 0 && newTurns.length === 0) {
            if (confirm("No original passages were modified and no new turns were added. Exit Director Mode?")) {
                this.discard();
            }
            return;
        }

        this._pendingModifications = modifications;
        this._pendingNewTurns = newTurns;

        // Setup the count spinbox
        const spliceControls = document.getElementById('dir-review-splice-controls');
        const countInput = document.getElementById('dir-review-turn-count');
        const totalLbl = document.getElementById('dir-review-total-lbl');

        if (newTurns.length > 0) {
            spliceControls.classList.remove('hidden');
            countInput.max = newTurns.length;
            countInput.value = newTurns.length; // Default to taking all of them
            totalLbl.textContent = `(of ${newTurns.length})`;
        } else {
            spliceControls.classList.add('hidden');
            countInput.value = 0;
        }

        this.renderReviewCards();
        document.getElementById('director-review-modal').classList.remove('hidden');
    }

    renderReviewCards() {
        const container = document.getElementById('director-review-diffs');
        container.innerHTML = '';

        // 1. Render Modifications to existing turns
        this._pendingModifications.forEach(mod => {
            const diffs = diffWords(mod.oldText, mod.newText);
            const card = document.createElement('div');
            card.className = 'ae-card';
            
            const headerStr = mod.turn._isTargetTurn ? 
                `<span style="color:var(--accent); font-weight:bold;">[🎬 Target Turn #${mod.turn._originIndex + 1}]</span>` : 
                `<span style="color:var(--text-muted); font-weight:bold;">Turn #${mod.turn._originIndex + 1}</span>`;

            card.innerHTML = `
                <div style="margin-bottom: 8px;">${headerStr}</div>
                <div class="ae-diff-container">
                    <div class="ae-diff-col">${diffs.oldHtml}</div>
                    <div class="ae-diff-col">${diffs.newHtml}</div>
                </div>
            `;
            container.appendChild(card);
        });

        // 2. Render selected slice of new turns
        const countInput = document.getElementById('dir-review-turn-count');
        const takeCount = Math.min(this._pendingNewTurns.length, Math.max(0, parseInt(countInput.value) || 0));
        const turnsToPreview = this._pendingNewTurns.slice(0, takeCount);

        turnsToPreview.forEach((turn, i) => {
            const card = document.createElement('div');
            card.className = 'ae-card';
            const roleColor = turn.role === 'user' ? '#60a5fa' : '#4ade80';
            const roleName = turn.role.charAt(0).toUpperCase() + turn.role.slice(1);
            
            card.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <span style="color:${roleColor}; font-weight:bold;">[➕ Splice: New ${roleName} Turn #${i + 1}]</span>
                </div>
                <div style="background: var(--bg-panel); padding: 8px; border-radius: 4px; border: 1px solid var(--border); white-space: pre-wrap; font-size: 0.85em;">${turn.drafts[turn.activeDraftIndex].content}</div>
            `;
            container.appendChild(card);
        });
    }

    commit() {
        if (!this.isActive) return;

        // Apply edits to existing turns in main state
        this._pendingModifications.forEach(mod => {
            const turn = mod.turn;
            if (turn._originIndex !== undefined) {
                this.mainStoryState.recordEdit(turn._originalContentSnapshot, mod.newText, 'director_mode');
                this.mainStoryState.editTurn(turn._originIndex, mod.newText);
            }
        });

        // Splice ONLY the user-specified count of new turns into the main history
        const countInput = document.getElementById('dir-review-turn-count');
        const takeCount = Math.min(this._pendingNewTurns.length, Math.max(0, parseInt(countInput.value) || 0));

        if (takeCount > 0) {
            const selectedNewTurns = structuredClone(this._pendingNewTurns.slice(0, takeCount));
            selectedNewTurns.forEach(t => {
                delete t._originIndex;
                delete t._isTargetTurn;
                delete t._originalContentSnapshot;
            });
            this.mainStoryState.history.splice(this.targetIndex + 1, 0, ...selectedNewTurns);
        }

        this.teardown();
        this.app.autoSave();
    }

    discard() {
        if (!this.isActive) return;
        this.teardown();
    }

    teardown() {
        const savedTargetIndex = this.targetIndex; // Capture before reset

        this.app.state = this.mainStoryState;
        this.isActive = false;
        this.mainStoryState = null;
        this.targetIndex = -1;
        this._pendingModifications = [];
        this._pendingNewTurns = [];

        // Restore Header UI
        document.getElementById('director-nav-group').classList.add('hidden');
        document.getElementById('avatar-container').classList.remove('hidden');
        document.getElementById('nanogpt-meter').classList.remove('hidden');
        document.getElementById('btn-open-timeline').classList.remove('hidden');
        
        if (settings.trackSummary) {
            document.getElementById('summary-meter-container').classList.remove('hidden');
        }

        this.app.state.buildPromptPayload();
        this.app.renderAll();

        // Restore Viewport anchoring to target passage
        if (savedTargetIndex !== -1) {
            setTimeout(() => {
                const targetEl = document.getElementById(`turn-wrapper-${savedTargetIndex}`);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('pulse-highlight');
                    setTimeout(() => targetEl.classList.remove('pulse-highlight'), 2000);
                }
            }, 50); // slight delay to ensure DOM is fully rendered
        }
    }
}
