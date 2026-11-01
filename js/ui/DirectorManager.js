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
            includeSummary: false,
            overrideSystemPrompt: true,
            customSystemPrompt: "You are an expert narrative editor helping the author polish this specific passage. Do not continue the forward plot. Output requested revisions or provide proposed changes. You may use <edit> blocks or output new drafts entirely."
        };

        this._pendingModifications = [];
        this._pendingNewTurns = [];

        this.loadSettings();
        this.bindEvents();
    }

    loadSettings() {
        const saved = localStorage.getItem('ai_proto_director_settings');
        if (saved) {
            Object.assign(this.settings, JSON.parse(saved));
        }
    }

    saveSettings() {
        localStorage.setItem('ai_proto_director_settings', JSON.stringify(this.settings));
    }

    bindEvents() {
        document.getElementById('btn-director-settings').addEventListener('click', () => this.openSettingsModal());
        document.getElementById('btn-director-exit').addEventListener('click', () => this.exit());
        
        // Settings Modal
        document.getElementById('btn-close-director-settings').addEventListener('click', () => document.getElementById('director-settings-modal').classList.add('hidden'));
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
                    }
                }

                // Update active sandbox properties that can safely change live
                this.app.state.disableSummary = !document.getElementById('dir-set-summary').checked;
                if (document.getElementById('dir-set-override').checked) {
                    this.app.state.systemPrompt = document.getElementById('dir-set-prompt').value;
                } else {
                    this.app.state.systemPrompt = this.mainStoryState.systemPrompt;
                }
                this.app.state.buildPromptPayload();
                this.app.renderAll();
            }

            this.settings.priorContextCount = newPrior;
            this.settings.includeSummary = document.getElementById('dir-set-summary').checked;
            this.settings.overrideSystemPrompt = document.getElementById('dir-set-override').checked;
            this.settings.customSystemPrompt = document.getElementById('dir-set-prompt').value;
            this.saveSettings();
            
            document.getElementById('director-settings-modal').classList.add('hidden');
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
        document.getElementById('dir-review-turn-count').addEventListener('input', () => {
            this.renderReviewCards();
        });
    }

    openSettingsModal() {
        document.getElementById('dir-set-prior').value = this.settings.priorContextCount;
        document.getElementById('dir-set-summary').checked = this.settings.includeSummary;
        document.getElementById('dir-set-override').checked = this.settings.overrideSystemPrompt;
        document.getElementById('dir-set-prompt').value = this.settings.customSystemPrompt;
        document.getElementById('director-settings-modal').classList.remove('hidden');
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
        
        sandboxState.disableSummary = !this.settings.includeSummary;
        if (this.settings.overrideSystemPrompt) {
            sandboxState.systemPrompt = this.settings.customSystemPrompt;
        }

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
