// BEGIN FILE: js/ui/SurgicalEditManager.js
export class SurgicalEditManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.surgicalState = null;
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-close-surgical').addEventListener('click', () => {
            document.getElementById('surgical-edit-modal').classList.add('hidden');
        });
        document.getElementById('btn-surgical-cancel').addEventListener('click', () => {
            document.getElementById('surgical-edit-modal').classList.add('hidden');
        });

        document.getElementById('surgical-context-lines').addEventListener('change', (e) => {
            if (!this.surgicalState) return;
            this.surgicalState.contextLines = parseInt(e.target.value);
            this.updateSurgicalModal(false);
        });

        document.getElementById('btn-surgical-apply').addEventListener('click', () => this.applySurgicalEdit());
    }

    openSurgicalEdit(pendingSelection) {
        if (!pendingSelection) return;
        
        const { msgIndex, startBlockIdx, endBlockIdx } = pendingSelection;
        const startIdx = startBlockIdx;
        const endIdx = endBlockIdx;
        
        const msg = this.uiManager.state.history[msgIndex];
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        
        // Use Marked's Lexer to get the exact raw string boundaries of the AST tokens
        const tokens = marked.lexer(activeDraft.content || '');
        const rawBlocks = tokens.map(t => t.raw);
        
        this.surgicalState = {
            msgIndex,
            rawBlocks,
            startP: startIdx,
            endP: endIdx,
            contextLines: parseInt(document.getElementById('surgical-context-lines').value) || 1
        };
        
        this.updateSurgicalModal(true);
        document.getElementById('surgical-edit-modal').classList.remove('hidden');
        window.getSelection().removeAllRanges();
    }

    updateSurgicalModal(overwriteTextarea = true) {
        const { rawBlocks, startP, endP, contextLines } = this.surgicalState;
        
        const topStart = Math.max(0, startP - contextLines);
        const topBlocks = rawBlocks.slice(topStart, startP);
        const topEl = document.getElementById('surgical-top-context');
        topEl.textContent = topBlocks.join('');
        topEl.style.display = topBlocks.length ? 'block' : 'none';
        
        if (overwriteTextarea) {
            const activeBlocks = rawBlocks.slice(startP, endP + 1);
            document.getElementById('surgical-edit-textarea').value = activeBlocks.join('');
        }
        
        const bottomEnd = Math.min(rawBlocks.length, endP + 1 + contextLines);
        const bottomBlocks = rawBlocks.slice(endP + 1, bottomEnd);
        const bottomEl = document.getElementById('surgical-bottom-context');
        bottomEl.textContent = bottomBlocks.join('');
        bottomEl.style.display = bottomBlocks.length ? 'block' : 'none';
    }

    applySurgicalEdit() {
        if (!this.surgicalState) return;
        const { msgIndex, rawBlocks, startP, endP } = this.surgicalState;
        
        const newActiveText = document.getElementById('surgical-edit-textarea').value;
        const before = rawBlocks.slice(0, startP).join('');
        const activeOriginal = rawBlocks.slice(startP, endP + 1).join('');
        const after = rawBlocks.slice(endP + 1).join('');
        
        const finalContent = before + newActiveText + after;
        
        const currentContent = this.uiManager.state.getContent(msgIndex);
        if (finalContent !== currentContent) {
            this.uiManager.state.recordEdit(activeOriginal, newActiveText, 'surgical');
            this.uiManager.state.editTurn(msgIndex, finalContent);
            this.uiManager.renderAll();
            this.uiManager.autoSave();
        }
        
        document.getElementById('surgical-edit-modal').classList.add('hidden');
        this.surgicalState = null;
    }
}
// END FILE: js/ui/SurgicalEditManager.js