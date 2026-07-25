export class DraftMergeManager {
    constructor(app) {
        this.app = app;
        
        this.targetMessageIndex = -1;
        this.activeSourceDraft = 0;
        this.currentParagraphs = [];
        
        // State tracking
        this.selectedLines = new Set();
        this.outputChunks = []; 
        this.historyStack = []; 

        this.injectHTML();
        this.bindEvents();
    }

    injectHTML() {
        const modal = document.createElement('div');
        modal.id = 'draft-merge-modal';
        modal.className = 'modal hidden';
        modal.style.padding = '0'; // Full bleed for mobile
        
        modal.innerHTML = `
            <div class="dm-content">
                <div class="dm-pane">
                    <div class="dm-header">
                        <select id="dm-draft-select"></select>
                        <button id="dm-btn-close">✖</button>
                    </div>
                    <div id="dm-source-scroll" class="dm-scroll"></div>
                </div>
                
                <div class="dm-actions">
                    <button id="dm-btn-append" class="primary">⬇️ Append</button>
                    <button id="dm-btn-undo" class="secondary">↩️ Undo</button>
                </div>
                
                <div class="dm-pane" style="padding: 6px; gap: 6px;">
                    <textarea id="dm-output-text" placeholder="Merged output will appear here. You can manually type and edit here between appends!"></textarea>
                    <button id="dm-btn-commit" class="primary" style="padding: 10px; font-weight: bold;">✅ Commit as New Draft</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    bindEvents() {
        document.getElementById('dm-btn-close').addEventListener('click', () => this.close());
        document.getElementById('dm-draft-select').addEventListener('change', (e) => this.switchDraft(parseInt(e.target.value)));
        
        document.getElementById('dm-btn-append').addEventListener('click', () => this.appendSelected());
        document.getElementById('dm-btn-undo').addEventListener('click', () => this.undoLast());
        document.getElementById('dm-btn-commit').addEventListener('click', () => this.commit());

        this.bindTouchSelectLogic();
    }

    bindTouchSelectLogic() {
        const container = document.getElementById('dm-source-scroll');
        let longPressTimer;
        let isDragging = false;

        const clearDrag = () => {
            clearTimeout(longPressTimer);
            setTimeout(() => { isDragging = false; }, 0); 
        };

        // Touch Events (Mobile)
        container.addEventListener('touchstart', (e) => {
            const cell = e.target.closest('.dm-cell');
            if (!cell) return;
            
            longPressTimer = setTimeout(() => {
                isDragging = true;
                if (navigator.vibrate) navigator.vibrate(40); // Haptic feedback
                
                const idx = parseInt(cell.dataset.idx);
                if (!this.isLineUsed(this.activeSourceDraft, idx)) {
                    this.selectedLines.add(idx);
                    this.updateCellVisuals();
                }
            }, 300); // 300ms hold to activate "paintbrush" drag
        }, { passive: false });

        container.addEventListener('touchmove', (e) => {
            if (!isDragging) {
                clearTimeout(longPressTimer);
                return;
            }
            e.preventDefault(); // Stop page scroll while paintbrushing
            
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) {
                const cell = target.closest('.dm-cell');
                if (cell) {
                    const hoverIndex = parseInt(cell.dataset.idx);
                    if (!this.isLineUsed(this.activeSourceDraft, hoverIndex)) {
                        this.selectedLines.add(hoverIndex);
                        this.updateCellVisuals();
                    }
                }
            }
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
            if (isDragging) e.preventDefault(); // prevent synthetic click
            clearDrag();
        });

        // Standard Click (Desktop / Quick Tap)
        container.addEventListener('click', (e) => {
            if (isDragging) return;
            const cell = e.target.closest('.dm-cell');
            if (!cell) return;
            
            const idx = parseInt(cell.dataset.idx);
            if (this.isLineUsed(this.activeSourceDraft, idx)) return;

            if (this.selectedLines.has(idx)) {
                this.selectedLines.delete(idx);
            } else {
                this.selectedLines.add(idx);
            }
            this.updateCellVisuals();
        });
    }

    open(msgIndex) {
        this.targetMessageIndex = msgIndex;
        const msg = this.app.state.history[msgIndex];
        
        // Reset states
        this.selectedLines.clear();
        this.outputChunks = [];
        this.historyStack = [];
        document.getElementById('dm-output-text').value = '';
        
        // Populate Dropdown
        const select = document.getElementById('dm-draft-select');
        select.innerHTML = '';
        msg.drafts.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            const modelStr = d.model ? d.model.split('/').pop() : 'Unknown';
            opt.textContent = `Draft ${i + 1} | ${modelStr}`;
            select.appendChild(opt);
        });

        document.getElementById('draft-merge-modal').classList.remove('hidden');
        this.switchDraft(msg.activeDraftIndex);
    }

    switchDraft(draftIdx) {
        this.activeSourceDraft = draftIdx;
        const msg = this.app.state.history[this.targetMessageIndex];
        const draftContent = msg.drafts[draftIdx].content || "";
        
        // Split by 1 or more newlines
        this.currentParagraphs = draftContent.split(/\n+/).filter(p => p.trim() !== '');
        this.selectedLines.clear();
        
        document.getElementById('dm-draft-select').value = draftIdx;
        this.renderSourceCells();
    }

    renderSourceCells() {
        const container = document.getElementById('dm-source-scroll');
        container.innerHTML = '';
        
        this.currentParagraphs.forEach((text, i) => {
            const cell = document.createElement('div');
            cell.className = 'dm-cell';
            cell.dataset.idx = i;
            cell.textContent = text;
            container.appendChild(cell);
        });
        
        this.updateCellVisuals();
    }

    updateCellVisuals() {
        const container = document.getElementById('dm-source-scroll');
        Array.from(container.children).forEach((cell, i) => {
            if (this.isLineUsed(this.activeSourceDraft, i)) {
                cell.className = 'dm-cell used';
            } else if (this.selectedLines.has(i)) {
                cell.className = 'dm-cell selected';
            } else {
                cell.className = 'dm-cell';
            }
        });
    }

    isLineUsed(draftIdx, lineIdx) {
        return this.outputChunks.some(chunk => chunk.sourceDraftIdx === draftIdx && chunk.sourceLines.includes(lineIdx));
    }

    appendSelected() {
        if (this.selectedLines.size === 0) return;
        
        const ta = document.getElementById('dm-output-text');
        const currentVal = ta.value;

        // Push current textarea state & chunk state to history for Undo
        this.historyStack.push({
            val: currentVal,
            chunks: JSON.parse(JSON.stringify(this.outputChunks)) 
        });
        
        // Grab lines in order
        const indices = Array.from(this.selectedLines).sort((a,b) => a - b);
        const newText = indices.map(i => this.currentParagraphs[i]).join('\n\n');
        
        this.outputChunks.push({ sourceDraftIdx: this.activeSourceDraft, sourceLines: indices });
        
        // Append
        const separator = currentVal.trim() === '' ? '' : '\n\n';
        ta.value = currentVal + separator + newText;
        
        this.selectedLines.clear();
        this.updateCellVisuals();
        
        // Auto-scroll textarea to bottom
        ta.scrollTop = ta.scrollHeight;
    }

    undoLast() {
        if (this.historyStack.length === 0) return;
        
        const lastState = this.historyStack.pop();
        document.getElementById('dm-output-text').value = lastState.val;
        this.outputChunks = lastState.chunks;
        
        this.selectedLines.clear();
        this.updateCellVisuals();
    }

    commit() {
        const finalContent = document.getElementById('dm-output-text').value.trim();
        if (!finalContent) return alert("Output is empty.");
        
        const msg = this.app.state.history[this.targetMessageIndex];
        
        msg.drafts.push({
            model: 'Merged Draft',
            content: finalContent,
            reasoning: '',
            status: 'done',
            duration: 0,
            markdownOverride: null,
            usage: null,
            isStale: false
        });
        
        this.app.state.setActiveDraft(this.targetMessageIndex, msg.drafts.length - 1);
        
        this.close();
        this.app.renderAll();
        this.app.autoSave();
    }

    close() {
        document.getElementById('draft-merge-modal').classList.add('hidden');
    }
}
