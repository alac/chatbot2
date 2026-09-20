// BEGIN FILE: js/ui/SurgicalEditManager.js
export class SurgicalEditManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.pendingSurgicalEdit = null;
        this.surgicalState = null;
        this.selectionTimeout = null;
        this.bindEvents();
    }

    bindEvents() {
        document.addEventListener('selectionchange', () => {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = setTimeout(() => this.handleSelectionChange(), 150);
        });

        const floatBtn = document.getElementById('floating-edit-btn');
        floatBtn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent focus loss that clears selection
            this.openSurgicalEdit();
        });

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

    handleSelectionChange() {
        const sel = window.getSelection();
        const floatBtn = document.getElementById('floating-edit-btn');
        
        if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) {
            floatBtn.classList.remove('visible');
            return;
        }

        const range = sel.getRangeAt(0);
        
        // Ensure we are operating on Element nodes to use .closest() safely
        let startNode = range.startContainer;
        let endNode = range.endContainer;
        if (startNode.nodeType === 3) startNode = startNode.parentNode;
        if (endNode.nodeType === 3) endNode = endNode.parentNode;
        
        // Find our mapped AST wrappers
        const startBlockEl = startNode.closest('[data-block-idx]');
        const endBlockEl = endNode.closest('[data-block-idx]');
        
        if (!startBlockEl || !endBlockEl) {
            floatBtn.classList.remove('visible');
            return;
        }

        const startIdx = parseInt(startBlockEl.dataset.blockIdx);
        const endIdx = parseInt(endBlockEl.dataset.blockIdx);
        
        // Ensure the selection doesn't span across different messages
        const turnContent = startBlockEl.closest('.turn-content');
        if (!turnContent || turnContent !== endBlockEl.closest('.turn-content')) {
            floatBtn.classList.remove('visible');
            return;
        }
        
        const turnElement = turnContent.closest('.turn');
        const idMatch = turnElement.id.match(/turn-wrapper-(\d+)/);
        if (!idMatch) return;
        
        const msgIndex = parseInt(idMatch[1]);
        const rect = range.getBoundingClientRect();
        
        floatBtn.style.left = `${rect.left + rect.width / 2}px`;
        floatBtn.style.top = `${Math.max(10, rect.top)}px`;
        floatBtn.classList.add('visible');
        
        this.pendingSurgicalEdit = {
            msgIndex,
            startIdx: Math.min(startIdx, endIdx),
            endIdx: Math.max(startIdx, endIdx)
        };
    }

    openSurgicalEdit() {
        document.getElementById('floating-edit-btn').classList.remove('visible');
        if (!this.pendingSurgicalEdit) return;
        
        const { msgIndex, startIdx, endIdx } = this.pendingSurgicalEdit;
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
        const after = rawBlocks.slice(endP + 1).join('');
        
        const finalContent = before + newActiveText + after;
        
        const currentContent = this.uiManager.state.getContent(msgIndex);
        if (finalContent !== currentContent) {
            this.uiManager.state.editTurn(msgIndex, finalContent);
            this.uiManager.renderAll();
            this.uiManager.autoSave();
        }
        
        document.getElementById('surgical-edit-modal').classList.add('hidden');
        this.surgicalState = null;
    }
}
// END FILE: js/ui/SurgicalEditManager.js