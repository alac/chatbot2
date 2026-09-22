export class BatchEditManager {
    constructor(app) {
        this.app = app;
        this.bindEvents();
    }

    bindEvents() {
        const triggers = ['batch-edit-start', 'batch-edit-end', 'batch-edit-role', 'batch-edit-action'];
        triggers.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.updateFeedback());
            document.getElementById(id).addEventListener('keyup', () => this.updateFeedback());
        });

        document.getElementById('btn-batch-all').addEventListener('click', () => {
            this.setRange(1, this.app.state.history.length);
            document.getElementById('batch-edit-role').value = 'all';
            this.updateFeedback();
        });

        document.getElementById('btn-batch-last-10').addEventListener('click', () => {
            const end = this.app.state.history.length;
            this.setRange(Math.max(1, end - 9), end);
            document.getElementById('batch-edit-role').value = 'all';
            this.updateFeedback();
        });

        document.getElementById('btn-batch-all-user').addEventListener('click', () => {
            this.setRange(1, this.app.state.history.length);
            document.getElementById('batch-edit-role').value = 'user';
            this.updateFeedback();
        });

        document.getElementById('btn-batch-all-bot').addEventListener('click', () => {
            this.setRange(1, this.app.state.history.length);
            document.getElementById('batch-edit-role').value = 'assistant';
            this.updateFeedback();
        });

        document.getElementById('btn-batch-edit-apply').addEventListener('click', () => this.applyBatchEdit());
    }

    setRange(start, end) {
        document.getElementById('batch-edit-start').value = start;
        document.getElementById('batch-edit-end').value = end;
    }

    populateUI() {
        const total = this.app.state.history.length;
        document.getElementById('batch-edit-total').textContent = `(Total: ${total})`;
        
        let start = parseInt(document.getElementById('batch-edit-start').value);
        let end = parseInt(document.getElementById('batch-edit-end').value);
        
        if (isNaN(start) || start < 1) document.getElementById('batch-edit-start').value = 1;
        if (isNaN(end) || end < 1 || end > total) document.getElementById('batch-edit-end').value = total || 1;

        this.updateFeedback();
    }

    updateFeedback() {
        const total = this.app.state.history.length;
        if (total === 0) {
            document.getElementById('batch-edit-feedback').textContent = "No messages available.";
            return;
        }

        let start = parseInt(document.getElementById('batch-edit-start').value) || 1;
        let end = parseInt(document.getElementById('batch-edit-end').value) || total;
        const role = document.getElementById('batch-edit-role').value;
        const action = document.getElementById('batch-edit-action').value;

        // Convert 1-based index to 0-based for internal state bounds checking
        let startIdx = Math.max(0, start - 1);
        let endIdx = Math.min(total - 1, end - 1);

        if (startIdx > endIdx) {
            document.getElementById('batch-edit-feedback').textContent = "Invalid range (Start > End).";
            document.getElementById('batch-edit-feedback').style.color = "var(--danger)";
            return;
        }

        let matchCount = 0;
        for (let i = startIdx; i <= endIdx; i++) {
            const msg = this.app.state.history[i];
            if (role === 'all' || msg.role === role) {
                matchCount++;
            }
        }

        const actionText = action === 'delete' ? 'delete' : (action === 'hide' ? 'hide' : 'un-hide');
        document.getElementById('batch-edit-feedback').textContent = `Will ${actionText} ${matchCount} message(s).`;
        document.getElementById('batch-edit-feedback').style.color = action === 'delete' ? 'var(--danger)' : 'var(--accent)';
    }

    applyBatchEdit() {
        const total = this.app.state.history.length;
        if (total === 0) return;

        let startIdx = (parseInt(document.getElementById('batch-edit-start').value) || 1) - 1;
        let endIdx = (parseInt(document.getElementById('batch-edit-end').value) || total) - 1;
        const role = document.getElementById('batch-edit-role').value;
        const action = document.getElementById('batch-edit-action').value;

        startIdx = Math.max(0, startIdx);
        endIdx = Math.min(total - 1, endIdx);
        if (startIdx > endIdx) return alert("Invalid range.");

        let affected = 0;
        if (action === 'delete') {
            if (!confirm("Are you sure you want to permanently delete these messages? You can undo this action immediately, but not later.")) return;
            affected = this.app.state.batchDelete(startIdx, endIdx, role);
        } else {
            const hide = (action === 'hide');
            affected = this.app.state.batchSetHidden(startIdx, endIdx, role, hide);
        }

        if (affected > 0) {
            this.app.state.buildPromptPayload();
            this.app.renderAll();
            this.app.autoSave();
            this.app.summaryManager.updateSummaryMeter();
            document.getElementById('tools-modal').classList.add('hidden');
        } else {
            alert("No messages matched the criteria in that range.");
        }
    }
}