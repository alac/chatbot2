// BEGIN FILE: js/ui/SelectionToolbarManager.js
export class SelectionToolbarManager {
    constructor(uiManager) {
        this.app = uiManager;
        this.pendingSelection = null;
        this.selectionTimeout = null;
        this.bindEvents();
    }

    bindEvents() {
        document.addEventListener('selectionchange', () => {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = setTimeout(() => this.handleSelectionChange(), 150);
        });

        const toolbar = document.getElementById('floating-selection-toolbar');
        toolbar.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent focus loss that clears selection
        });

        document.getElementById('btn-float-edit').addEventListener('click', () => {
            toolbar.classList.add('hidden');
            if (this.pendingSelection) {
                this.app.surgicalEditManager.openSurgicalEdit(this.pendingSelection);
                window.getSelection().removeAllRanges();
            }
        });

        document.getElementById('btn-float-rewrite').addEventListener('click', () => {
            toolbar.classList.add('hidden');
            if (this.pendingSelection) {
                this.app.rewriterManager.openRewriteModal(this.pendingSelection);
                window.getSelection().removeAllRanges();
            }
        });
    }

    handleSelectionChange() {
        const sel = window.getSelection();
        const toolbar = document.getElementById('floating-selection-toolbar');
        
        if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) {
            toolbar.classList.add('hidden');
            return;
        }

        const range = sel.getRangeAt(0);
        
        let startNode = range.startContainer;
        let endNode = range.endContainer;
        if (startNode.nodeType === 3) startNode = startNode.parentNode;
        if (endNode.nodeType === 3) endNode = endNode.parentNode;
        
        const startBlockEl = startNode.closest('[data-block-idx]');
        const endBlockEl = endNode.closest('[data-block-idx]');
        
        if (!startBlockEl || !endBlockEl) {
            toolbar.classList.add('hidden');
            return;
        }

        const startIdx = parseInt(startBlockEl.dataset.blockIdx);
        const endIdx = parseInt(endBlockEl.dataset.blockIdx);
        
        const turnContent = startBlockEl.closest('.turn-content');
        if (!turnContent || turnContent !== endBlockEl.closest('.turn-content')) {
            toolbar.classList.add('hidden');
            return;
        }
        
        const turnElement = turnContent.closest('.turn');
        const idMatch = turnElement.id.match(/turn-wrapper-(\d+)/);
        if (!idMatch) return;
        
        const msgIndex = parseInt(idMatch[1]);
        const rect = range.getBoundingClientRect();
        
        toolbar.style.left = `${rect.left + rect.width / 2}px`;
        toolbar.style.top = `${Math.max(10, rect.top)}px`;
        toolbar.classList.remove('hidden');

        // Measure exact character offsets inside the start/end blocks
        const startPreRange = document.createRange();
        startPreRange.selectNodeContents(startBlockEl);
        startPreRange.setEnd(range.startContainer, range.startOffset);
        const intraBlockStart = startPreRange.toString().length;

        const endPreRange = document.createRange();
        endPreRange.selectNodeContents(endBlockEl);
        endPreRange.setEnd(range.endContainer, range.endOffset);
        const intraBlockEnd = endPreRange.toString().length;
        
        this.pendingSelection = {
            msgIndex,
            startBlockIdx: Math.min(startIdx, endIdx),
            endBlockIdx: Math.max(startIdx, endIdx),
            intraBlockStart,
            intraBlockEnd
        };
    }
}
// END FILE: js/ui/SelectionToolbarManager.js