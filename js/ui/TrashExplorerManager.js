import { TextRenderer } from './TextRenderer.js';

export class TrashExplorerManager {
    constructor(app) {
        this.app = app;
        this.currentIndex = 0;
        this.injectHTML();
        this.bindEvents();
    }

    injectHTML() {
        const modal = document.createElement('div');
        modal.id = 'trash-explorer-modal';
        modal.className = 'modal hidden';
        modal.style.padding = '0'; // Full bleed style
        modal.style.zIndex = '120';

        modal.innerHTML = `
            <div class="modal-content" style="width: 100vw; height: 100vh; height: 100dvh; max-width: none; max-height: none; border-radius: 0; display:flex; flex-direction:column; background: var(--bg-main);">
                
                <div class="modal-header" style="padding: 8px 12px; background: var(--bg-panel); flex-shrink: 0;">
                    <h2 style="font-size: 1.1em; display:flex; align-items:center; gap:8px;">
                        <span>🗑️ Trash Explorer</span>
                    </h2>
                    <button id="btn-close-trash" class="close-btn">&times;</button>
                </div>
                
                <div style="padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-panel); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0;">
                    <button id="btn-trash-prev" class="secondary" style="padding: 6px 12px;">&laquo; Older</button>
                    <button id="btn-trash-restore" class="primary" style="flex:1; max-width: 200px; padding: 6px;">🔄 Restore to Chat</button>
                    <button id="btn-trash-next" class="secondary" style="padding: 6px 12px;">Newer &raquo;</button>
                </div>
                
                <div id="trash-meta-label" style="padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--bg-main); font-size: 0.85em; color: var(--text-muted); text-align: center; flex-shrink: 0;">
                    <!-- Metadata goes here -->
                </div>
                
                <div class="modal-body" style="padding: 16px; flex: 1; overflow-y: auto; display:flex; flex-direction:column; gap: 12px; background: var(--bg-main);">
                    <div id="trash-reasoning-block" class="thinking-block hidden" style="margin: 0;"></div>
                    <div id="trash-content-block" class="turn-content" style="line-height: 1.5; white-space: pre-wrap; word-break: break-word;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    bindEvents() {
        document.getElementById('btn-close-trash').addEventListener('click', () => this.close());
        document.getElementById('btn-trash-prev').addEventListener('click', () => this.navigate(1)); // Older = higher index
        document.getElementById('btn-trash-next').addEventListener('click', () => this.navigate(-1)); // Newer = lower index
        document.getElementById('btn-trash-restore').addEventListener('click', () => this.restore());
    }

    open() {
        const trash = this.app.state.trash;
        if (!trash || trash.length === 0) {
            alert("Trash is empty.");
            return;
        }
        this.currentIndex = 0; // 0 is the most recently deleted
        this.render();
        document.getElementById('trash-explorer-modal').classList.remove('hidden');
    }

    close() {
        document.getElementById('trash-explorer-modal').classList.add('hidden');
    }

    navigate(dir) {
        const trash = this.app.state.trash;
        const newIndex = this.currentIndex + dir;
        if (newIndex >= 0 && newIndex < trash.length) {
            this.currentIndex = newIndex;
            this.render();
        }
    }

    render() {
        const trash = this.app.state.trash;
        const item = trash[this.currentIndex];
        
        if (!item) {
            this.close();
            return;
        }

        // Manage button disabled states
        document.getElementById('btn-trash-prev').disabled = this.currentIndex === trash.length - 1;
        document.getElementById('btn-trash-next').disabled = this.currentIndex === 0;

        // Metadata Header
        const dateObj = new Date(item.deletedAt || Date.now());
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const roleStr = item.role.charAt(0).toUpperCase() + item.role.slice(1);
        const modelStr = item.model ? ` • ${item.model.split('/').pop()}` : '';

        document.getElementById('trash-meta-label').innerHTML = `
            <span style="font-weight: bold; color: var(--text-main);">Draft ${this.currentIndex + 1} of ${trash.length}</span><br>
            <span>${roleStr}${modelStr}</span> • <span>${dateStr}</span>
        `;

        // Content Display
        const reasonDiv = document.getElementById('trash-reasoning-block');
        const contentDiv = document.getElementById('trash-content-block');

        if (item.reasoning) {
            reasonDiv.textContent = item.reasoning;
            reasonDiv.classList.remove('hidden');
        } else {
            reasonDiv.textContent = '';
            reasonDiv.classList.add('hidden');
        }

        TextRenderer.setNodeContent(contentDiv, item.content, { markdownOverride: null });
    }

    restore() {
        if (!this.app.state.trash[this.currentIndex]) return;
        
        const restoredIdx = this.app.state.restoreFromTrash(this.currentIndex);
        if (restoredIdx !== -1) {
            this.app.state.buildPromptPayload();
            this.app.renderAll();
            this.app.autoSave();
            this.close();
        }
    }
}