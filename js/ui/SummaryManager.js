// BEGIN FILE: js/ui/SummaryManager.js
import { settings } from '../state/AppSettings.js';
import { GenerationJob } from '../api/OpenAIClient.js';
import { diffLines } from '../utils/diff.js';
import { TokenCalculator } from '../utils/TokenCalculator.js';

export class SummaryManager {
    constructor(app) {
        this.app = app;
        this.activeSumJob = null;
        this.sumTargetIndices = [];
        this.mergeLines = [];

        this.bindEvents();
    }

    bindEvents() {
        // Summary Meter clicks
        document.getElementById('summary-meter-container').addEventListener('click', (e) => {
            if (e.target.id === 'btn-quick-summarize') this.startAutosummarize();
            else { 
                this.updateSummaryMeterDetails(); 
                document.getElementById('meter-details-modal').classList.remove('hidden'); 
            }
        });
        document.getElementById('btn-close-meter-details').addEventListener('click', () => {
            document.getElementById('meter-details-modal').classList.add('hidden');
        });
        document.getElementById('btn-run-autosummarize').addEventListener('click', () => {
            document.getElementById('chat-settings-modal').classList.add('hidden');
            this.startAutosummarize();
        });

        // Autosummarize Prompt Selector
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

        // Autosummarize Streaming Modal
        document.getElementById('btn-close-autosum-stream').addEventListener('click', () => {
            if (this.activeSumJob) this.activeSumJob.cancel();
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-cancel').addEventListener('click', () => {
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-replace').addEventListener('click', () => {
            this.app.state.summary = document.getElementById('autosum-stream-output').value.trim();
            this.applySummarizeFlags();
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-append').addEventListener('click', () => {
            const output = document.getElementById('autosum-stream-output').value.trim();
            if (this.app.state.summary) this.app.state.summary += "\n\n" + output;
            else this.app.state.summary = output;
            this.applySummarizeFlags();
            document.getElementById('autosum-stream-modal').classList.add('hidden');
        });
        document.getElementById('btn-autosum-edit').addEventListener('click', () => {
            document.getElementById('autosum-stream-modal').classList.add('hidden');
            this.openMergeUI(document.getElementById('autosum-stream-output').value.trim());
        });

        // Autosummarize Merge Modal
        document.getElementById('merge-page-selector').addEventListener('change', (e) => {
            const modal = document.getElementById('autosum-merge-modal');
            modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });
        document.getElementById('btn-close-autosum-merge').addEventListener('click', () => document.getElementById('autosum-merge-modal').classList.add('hidden'));
        document.getElementById('btn-merge-cancel').addEventListener('click', () => document.getElementById('autosum-merge-modal').classList.add('hidden'));
        document.getElementById('btn-merge-append').addEventListener('click', () => {
            const output = document.getElementById('autosum-stream-output').value.trim();
            if (this.app.state.summary) this.app.state.summary += "\n\n" + output;
            else this.app.state.summary = output;
            this.applySummarizeFlags();
            document.getElementById('autosum-merge-modal').classList.add('hidden');
        });
        document.getElementById('btn-merge-accept').addEventListener('click', () => {
            this.app.state.summary = document.getElementById('merge-preview-textarea').value.trim();
            this.applySummarizeFlags();
            document.getElementById('autosum-merge-modal').classList.add('hidden');
        });
    }

    updateSummaryMeter() {
        const container = document.getElementById('summary-meter-container');
        if (!settings.trackSummary) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');

        const stats = TokenCalculator.getUsageStats(this.app.state, settings);
        const pct = stats.percentageUsed;

        const fill = document.getElementById('summary-meter-fill');
        const text = document.getElementById('summary-meter-text');
        
        fill.style.width = `${pct}%`;
        text.textContent = `${pct}%`;

        if (pct >= 90) fill.style.background = 'rgba(239, 68, 68, 0.6)'; 
        else if (pct >= 60) fill.style.background = 'rgba(234, 179, 8, 0.6)'; 
        else fill.style.background = 'rgba(59, 130, 246, 0.4)'; 
    }

    updateSummaryMeterDetails() {
        const stats = TokenCalculator.getUsageStats(this.app.state, settings);

        document.getElementById('meter-stat-max').textContent = stats.maxContext;
        document.getElementById('meter-stat-resp').textContent = stats.maxResp;
        document.getElementById('meter-stat-mem').textContent = stats.memCost;
        document.getElementById('meter-stat-an').textContent = stats.anCost;
        document.getElementById('meter-stat-sum').textContent = stats.sumCost;
        document.getElementById('meter-stat-budget').textContent = stats.availableBudget;
        document.getElementById('meter-stat-summed').textContent = stats.summedCost;
        document.getElementById('meter-stat-unsummed').textContent = stats.unsummedCost;
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
            if (this.app.state.selectedAutoSumPromptTitle === title) btn.classList.add('primary');
            btn.textContent = title;
            btn.title = content;
            btn.addEventListener('click', () => {
                this.app.state.selectedAutoSumPromptTitle = title;
                this.app.state.selectedAutoSumPromptText = content;
                document.getElementById('lbl-active-sum-prompt').textContent = title;
                document.getElementById('autosum-prompt-modal').classList.add('hidden');
                this.app.autoSave();
            });
            container.appendChild(btn);
        });
        document.getElementById('autosum-prompt-modal').classList.remove('hidden');
    }

    async startAutosummarize() {
        const payloadObj = this.app.state.buildPromptPayload(true, this.app.state.selectedAutoSumPromptText);
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
            if (this.app.state.history[idx]) {
                this.app.state.history[idx].wasSummarized = true;
            }
        });
        if (window.settingsUI) window.settingsUI.populateUI();
        this.updateSummaryMeter();
        this.app.autoSave();
    }

    openMergeUI(newSummary) {
        const oldSummary = this.app.state.summary.trim();
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
}