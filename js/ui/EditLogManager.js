// BEGIN FILE: js/ui/EditLogManager.js
export class EditLogManager {
    constructor(app) {
        this.app = app;
        this.injectHTML();
        this.bindEvents();
    }

    injectHTML() {
        const modal = document.createElement('div');
        modal.id = 'edit-log-modal';
        modal.className = 'modal hidden';
        modal.style.padding = '0';
        modal.style.zIndex = '110'; // Keep above tools modal

        modal.innerHTML = `
            <div class="modal-content" style="width: 100vw; height: 100vh; height: 100dvh; max-width: none; max-height: none; border-radius: 0; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h2>Edit Log</h2>
                    <div style="display:flex; gap: 8px;">
                        <button id="btn-editlog-export" class="primary">💾 Export .jsonl</button>
                        <button id="btn-editlog-delete" class="danger">🗑️ Delete All</button>
                        <button id="btn-editlog-close" class="close-btn">&times;</button>
                    </div>
                </div>
                <div class="modal-body" style="flex:1; padding: 0; overflow:hidden; display:flex; flex-direction:column; background: var(--bg-main);">
                    <textarea id="editlog-textarea" style="flex:1; width: 100%; resize: none; font-family: monospace; padding: 16px; font-size: 0.95em; border: none; background: transparent; color: var(--text-main);" readonly placeholder="No edits recorded yet."></textarea>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    bindEvents() {
        document.getElementById('btn-editlog-close').addEventListener('click', () => this.close());
        document.getElementById('btn-editlog-delete').addEventListener('click', () => this.deleteAll());
        document.getElementById('btn-editlog-export').addEventListener('click', () => this.exportJsonl());
    }

    open() {
        this.updateTextarea();
        document.getElementById('edit-log-modal').classList.remove('hidden');
    }

    close() {
        document.getElementById('edit-log-modal').classList.add('hidden');
    }

    updateTextarea() {
        const textarea = document.getElementById('editlog-textarea');
        textarea.value = this.app.state.getEditLogAsJsonl();
    }

    deleteAll() {
        if (!confirm("Are you sure you want to clear the entire edit log? This cannot be undone.")) return;
        this.app.state.clearEditLog();
        this.updateTextarea();
        this.app.autoSave();
    }

    exportJsonl() {
        const content = this.app.state.getEditLogAsJsonl();
        if (!content.trim()) {
            alert("No edits to export.");
            return;
        }

        const safeSlotName = (this.app.activeSlotName || 'slot').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `${safeSlotName}_edits_${Date.now()}.jsonl`;

        const blob = new Blob([content], { type: 'application/jsonl+json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
// END FILE: js/ui/EditLogManager.js