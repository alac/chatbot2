// BEGIN FILE: js/ui/DirectorManager.js
import { StoryState } from '../state/StoryState.js';
import { diffWords } from '../utils/diff.js';

export class DirectorManager {
    constructor(app) {
        this.app = app;
        this.isActive = false;
        this.mainStoryState = null;
        
        // Default Director Settings
        this.settings = {
            priorContextCount: 3,
            postContextCount: 1,
            includeSummary: false,
            overrideSystemPrompt: true,
            customSystemPrompt: "You are an expert narrative editor helping the author polish this specific passage. Do not continue the forward plot. Output requested revisions or provide proposed changes. You may use <edit> blocks or output new drafts entirely."
        };

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
            this.settings.priorContextCount = parseInt(document.getElementById('dir-set-prior').value) || 0;
            this.settings.postContextCount = parseInt(document.getElementById('dir-set-post').value) || 0;
            this.settings.includeSummary = document.getElementById('dir-set-summary').checked;
            this.settings.overrideSystemPrompt = document.getElementById('dir-set-override').checked;
            this.settings.customSystemPrompt = document.getElementById('dir-set-prompt').value;
            this.saveSettings();
            
            if (this.isActive) {
                // Update active sandbox properties if modified mid-session
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
        document.getElementById('dir-set-post').value = this.settings.postContextCount;
        document.getElementById('dir-set-summary').checked = this.settings.includeSummary;
        document.getElementById('dir-set-override').checked = this.settings.overrideSystemPrompt;
        document.getElementById('dir-set-prompt').value = this.settings.customSystemPrompt;
        document.getElementById('director-settings-modal').classList.remove('hidden');
    }

    enter(targetIndex) {
        if (this.isActive) return;

        this.mainStoryState = this.app.state;
        const mainHistory = this.mainStoryState.history;
        
        // Calculate Slice Bounds
        const startIdx = Math.max(0, targetIndex - this.settings.priorContextCount);
        const endIdx = Math.min(mainHistory.length - 1, targetIndex + this.settings.postContextCount);

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
        document.querySelector('.nav-controls').classList.add('hidden');
        
        const dirGroup = document.getElementById('director-nav-group');
        document.getElementById('director-badge').textContent = `🎬 Turn #${targetIndex + 1}`;
        dirGroup.classList.remove('hidden');

        // Render
        this.app.state.buildPromptPayload();
        this.app.renderAll();
    }

    exit() {
        if (!this.isActive) return;

        const modifications = [];
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
            }
        });

        if (modifications.length === 0) {
            if (confirm("No original passages were modified. Exit Director Mode?")) {
                this.discard();
            }
            return;
        }

        this.showReviewModal(modifications);
    }

    showReviewModal(modifications) {
        const container = document.getElementById('director-review-diffs');
        container.innerHTML = '';

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

        document.getElementById('director-review-modal').classList.remove('hidden');
    }

    commit() {
        if (!this.isActive) return;

        // Apply changes to main state
        this.app.state.history.forEach(turn => {
            if (turn._originIndex !== undefined && turn.drafts && turn.drafts[turn.activeDraftIndex]) {
                const currentContent = turn.drafts[turn.activeDraftIndex].content;
                if (currentContent !== turn._originalContentSnapshot) {
                    this.mainStoryState.recordEdit(turn._originalContentSnapshot, currentContent, 'director_mode');
                    this.mainStoryState.editTurn(turn._originIndex, currentContent);
                }
            }
        });

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

        // Restore Header UI
        document.getElementById('director-nav-group').classList.add('hidden');
        document.getElementById('avatar-container').classList.remove('hidden');
        document.getElementById('nanogpt-meter').classList.remove('hidden');
        document.querySelector('.nav-controls').classList.remove('hidden');
        
        if (settings.trackSummary) document.getElementById('summary-meter-container').classList.remove('hidden');

        this.app.state.buildPromptPayload();
        this.app.renderAll();
    }
}
// END FILE: js/ui/DirectorManager.js