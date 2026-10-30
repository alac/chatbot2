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
            const newPrior = parseInt(document.getElementById('dir-set-prior').value) || 0;
            const boundsChanged = (newPrior !== this.currentSessionPrior);

            this.settings.priorContextCount = newPrior;
            this.settings.includeSummary = document.getElementById('dir-set-summary').checked;
            this.settings.overrideSystemPrompt = document.getElementById('dir-set-override').checked;
            this.settings.customSystemPrompt = document.getElementById('dir-set-prompt').value;
            this.saveSettings();
            
            if (this.isActive) {
                // If user changed turn counts mid-session, warn and offer to kick out
                if (boundsChanged) {
                    const shouldExit = confirm(
                        "Context window bounds (prior turns) cannot be applied to an ongoing session without restarting it.\n\nDiscard this session and exit Director Mode now so you can start fresh with the new context?"
                    );
                    if (shouldExit) {
                        document.getElementById('director-settings-modal').classList.add('hidden');
                        this.discard();
                        return;
                    }
                }

                // Update active sandbox properties that can safely change live
                this.app.state.disableSummary = !this.settings.includeSummary;
                if (this.settings.overrideSystemPrompt) {
                    this.app.state.systemPrompt = this.settings.customSystemPrompt;
                } else {
                    this.app.state.systemPrompt = this.mainStoryState.systemPrompt;
                }
                this.app.state.buildPromptPayload();
            }
            
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
        this.showReviewModal(modifications, newTurns);
    }

    showReviewModal(modifications, newTurns) {
        const container = document.getElementById('director-review-diffs');
        container.innerHTML = '';

        // 1. Render Modifications to existing turns
        modifications.forEach(mod => {
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

        // 2. Render brand new inserted turns
        newTurns.forEach((turn, i) => {
            const card = document.createElement('div');
            card.className = 'ae-card';
            const roleColor = turn.role === 'user' ? '#60a5fa' : '#4ade80';
            const roleName = turn.role.charAt(0).toUpperCase() + turn.role.slice(1);
            
            card.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <span style="color:${roleColor}; font-weight:bold;">[➕ Splice: New ${roleName} Turn]</span>
                </div>
                <div style="background: var(--bg-panel); padding: 8px; border-radius: 4px; border: 1px solid var(--border); white-space: pre-wrap; font-size: 0.85em;">${turn.drafts[turn.activeDraftIndex].content}</div>
            `;
            container.appendChild(card);
        });

        document.getElementById('director-review-modal').classList.remove('hidden');
    }

    commit() {
        if (!this.isActive) return;

        // Apply edits to main state
        this._pendingModifications.forEach(mod => {
            const turn = mod.turn;
            if (turn._originIndex !== undefined) {
                this.mainStoryState.recordEdit(turn._originalContentSnapshot, mod.newText, 'director_mode');
                this.mainStoryState.editTurn(turn._originIndex, mod.newText);
            }
        });

        // Splice generated new turns back into main history
        if (this._pendingNewTurns.length > 0) {
            // Clean out sandbox metadata before splicing
            const cleanNewTurns = structuredClone(this._pendingNewTurns);
            cleanNewTurns.forEach(t => {
                delete t._originIndex;
                delete t._isTargetTurn;
                delete t._originalContentSnapshot;
            });
            // Splice exactly after the target index (which is where the sandbox left off)
            this.mainStoryState.history.splice(this.targetIndex + 1, 0, ...cleanNewTurns);
        }

        this.teardown();
        this.app.autoSave();
    }

    discard() {
        if (!this.isActive) return;
        this.teardown();
    }

    teardown() {
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
    }
}
