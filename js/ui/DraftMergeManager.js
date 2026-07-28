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
        
        // New State for persistence during a session
        this.scrollPositions = {}; 
        this.starredLines = {}; 

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
                <div id="dm-top-pane" class="dm-pane" style="flex: 0 0 60%;">
                    <div class="dm-header">
                        <div class="dm-header-controls">
                            <button id="dm-btn-prev">◀</button>
                            <select id="dm-draft-select"></select>
                            <button id="dm-btn-next">▶</button>
                        </div>
                        <button id="dm-btn-close" style="margin-left: 12px;">✖</button>
                    </div>
                    <div id="dm-scroll-wrapper">
                        <div id="dm-source-scroll" class="dm-scroll"></div>
                        <div id="dm-minimap">
                            <div id="dm-minimap-viewport"></div>
                            <div id="dm-minimap-stars-container"></div>
                        </div>
                    </div>
                </div>
                
                <div id="dm-resizer">
                    <div class="dm-resizer-handle"></div>
                </div>
                
                <div id="dm-bottom-pane" class="dm-pane">
                    <textarea id="dm-output-text" placeholder="Merged output will appear here. You can manually type and edit here between appends!"></textarea>
                    
                    <div class="dm-actions-bottom">
                        <button id="dm-btn-append" class="primary" style="flex: 1.5;">⬇️ Append</button>
                        <button id="dm-btn-undo" class="secondary" style="flex: 1;">↩️ Undo</button>
                        <button id="dm-btn-commit" class="primary" style="flex: 1.5;">✅ Combine</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    bindEvents() {
        document.getElementById('dm-btn-close').addEventListener('click', () => this.close());
        document.getElementById('dm-draft-select').addEventListener('change', (e) => this.switchDraft(parseInt(e.target.value)));
        
        document.getElementById('dm-btn-prev').addEventListener('click', () => this.navigateDraft(-1));
        document.getElementById('dm-btn-next').addEventListener('click', () => this.navigateDraft(1));
        
        document.getElementById('dm-btn-append').addEventListener('click', () => this.appendSelected());
        document.getElementById('dm-btn-undo').addEventListener('click', () => this.undoLast());
        document.getElementById('dm-btn-commit').addEventListener('click', () => this.commit());

        document.getElementById('dm-source-scroll').addEventListener('scroll', () => this.updateMinimapViewport());

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('draft-merge-modal').classList.contains('hidden')) return;
            
            // Ignore if they are actively typing in the textarea
            if (e.target.id === 'dm-output-text') return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigateDraft(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateDraft(1);
            }
        });

        this.bindSelectLogic();
        this.bindResizerLogic();
    }
    
    bindResizerLogic() {
        const resizer = document.getElementById('dm-resizer');
        const topPane = document.getElementById('dm-top-pane');
        const container = document.querySelector('.dm-content');

        resizer.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            resizer.setPointerCapture(e.pointerId);
            let isResizing = true;
            
            const doResize = (moveEvent) => {
                if (!isResizing) return;
                const containerTop = container.getBoundingClientRect().top;
                let newHeight = moveEvent.clientY - containerTop;
                
                if (newHeight < 60) newHeight = 60;
                const maxH = container.clientHeight - 100;
                if (newHeight > maxH) newHeight = maxH;
                
                topPane.style.flex = `0 0 ${newHeight}px`;
                this.updateMinimapViewport(); // Update red box on resize
            };
            
            const stopResize = () => {
                isResizing = false;
                resizer.releasePointerCapture(e.pointerId);
                resizer.removeEventListener('pointermove', doResize);
                resizer.removeEventListener('pointerup', stopResize);
                resizer.removeEventListener('pointercancel', stopResize);
            };
            
            resizer.addEventListener('pointermove', doResize);
            resizer.addEventListener('pointerup', stopResize);
            resizer.addEventListener('pointercancel', stopResize);
        });
    }

    bindSelectLogic() {
        const container = document.getElementById('dm-source-scroll');
        let longPressTimer;
        let isDragging = false;
        let dragMode = null; // 'select' or 'erase'

        const clearDrag = () => {
            clearTimeout(longPressTimer);
            setTimeout(() => { isDragging = false; dragMode = null; }, 0); 
        };

        const processDragCell = (cell) => {
            if (!cell) return;
            const idx = parseInt(cell.dataset.idx);
            if (this.isLineUsed(this.activeSourceDraft, idx)) return;

            if (dragMode === 'select') {
                this.selectedLines.add(idx);
            } else if (dragMode === 'erase') {
                this.selectedLines.delete(idx);
            }
            this.updateCellVisuals();
        };

        // --- Touch Events (Mobile) ---
        container.addEventListener('touchstart', (e) => {
            if (e.target.closest('.dm-star-btn')) return; // Ignore star clicks
            
            const cell = e.target.closest('.dm-cell');
            if (!cell) return;
            
            longPressTimer = setTimeout(() => {
                isDragging = true;
                if (navigator.vibrate) navigator.vibrate(40);
                
                const idx = parseInt(cell.dataset.idx);
                // Smart Paintbrush logic
                dragMode = this.selectedLines.has(idx) ? 'erase' : 'select';
                processDragCell(cell);
            }, 300); 
        }, { passive: false });

        container.addEventListener('touchmove', (e) => {
            if (!isDragging) {
                clearTimeout(longPressTimer);
                return;
            }
            e.preventDefault(); 
            
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) {
                processDragCell(target.closest('.dm-cell'));
            }
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
            if (isDragging) e.preventDefault(); 
            clearDrag();
        });

        // --- Mouse Events (Desktop) ---
        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('.dm-star-btn')) return; // Ignore star clicks
            
            const cell = e.target.closest('.dm-cell');
            if (!cell) return;
            
            isDragging = true;
            const idx = parseInt(cell.dataset.idx);
            // Smart Paintbrush logic for mouse
            dragMode = this.selectedLines.has(idx) ? 'erase' : 'select';
            processDragCell(cell);
        });

        container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            processDragCell(e.target.closest('.dm-cell'));
        });

        // Use global mouseup to safely stop drag even if outside container
        document.addEventListener('mouseup', () => {
            if (isDragging) clearDrag();
        });

        // Standard Click (Desktop / Quick Tap)
        container.addEventListener('click', (e) => {
            if (isDragging) return;
            if (e.target.closest('.dm-star-btn')) return; // Ignore star clicks
            
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
        this.scrollPositions = {};
        this.starredLines = {};
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
        this.activeSourceDraft = null; // Force switch to trigger setup
        this.switchDraft(msg.activeDraftIndex);
    }

    navigateDraft(direction) {
        const msg = this.app.state.history[this.targetMessageIndex];
        const len = msg.drafts.length;
        if (len <= 1) return;
        
        let newIdx = (this.activeSourceDraft + direction) % len;
        if (newIdx < 0) newIdx += len; // Handle JS negative modulo
        
        this.switchDraft(newIdx);
    }

    switchDraft(draftIdx) {
        const scrollContainer = document.getElementById('dm-source-scroll');
        
        // Save old scroll position if a draft is already active
        if (this.activeSourceDraft !== null) {
            this.scrollPositions[this.activeSourceDraft] = scrollContainer.scrollTop;
        }
        
        this.activeSourceDraft = draftIdx;
        
        // Init starred lines set for this draft if needed
        if (!this.starredLines[draftIdx]) {
            this.starredLines[draftIdx] = new Set();
        }

        const msg = this.app.state.history[this.targetMessageIndex];
        const draftContent = msg.drafts[draftIdx].content || "";
        
        // Split by 1 or more newlines
        this.currentParagraphs = draftContent.split(/\n+/).filter(p => p.trim() !== '');
        this.selectedLines.clear();
        
        document.getElementById('dm-draft-select').value = draftIdx;
        this.renderSourceCells();
        
        // Restore scroll position (has to happen after render)
        scrollContainer.scrollTop = this.scrollPositions[draftIdx] || 0;
        
        this.renderMinimapStars();
        this.updateMinimapViewport();
    }

    renderSourceCells() {
        const container = document.getElementById('dm-source-scroll');
        container.innerHTML = '';
        
        const currentStars = this.starredLines[this.activeSourceDraft];
        
        this.currentParagraphs.forEach((text, i) => {
            const cell = document.createElement('div');
            cell.className = 'dm-cell';
            cell.dataset.idx = i;
            
            const content = document.createElement('div');
            content.className = 'dm-cell-content';
            content.textContent = text;
            
            const starBtn = document.createElement('button');
            starBtn.className = 'dm-star-btn';
            
            const isStarred = currentStars.has(i);
            starBtn.innerHTML = isStarred ? '⭐' : '☆';
            if (isStarred) starBtn.classList.add('active');
            
            starBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger cell selection
                if (currentStars.has(i)) {
                    currentStars.delete(i);
                    starBtn.innerHTML = '☆';
                    starBtn.classList.remove('active');
                } else {
                    currentStars.add(i);
                    starBtn.innerHTML = '⭐';
                    starBtn.classList.add('active');
                }
                this.renderMinimapStars();
            });

            cell.appendChild(content);
            cell.appendChild(starBtn);
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

    updateMinimapViewport() {
        const scrollContainer = document.getElementById('dm-source-scroll');
        const viewport = document.getElementById('dm-minimap-viewport');
        
        if (scrollContainer.scrollHeight <= 0) return;
        
        const topPct = (scrollContainer.scrollTop / scrollContainer.scrollHeight) * 100;
        const heightPct = (scrollContainer.clientHeight / scrollContainer.scrollHeight) * 100;
        
        viewport.style.top = `${topPct}%`;
        viewport.style.height = `${Math.min(heightPct, 100)}%`;
    }

    renderMinimapStars() {
        const container = document.getElementById('dm-minimap-stars-container');
        const scrollContainer = document.getElementById('dm-source-scroll');
        container.innerHTML = '';
        
        const currentStars = this.starredLines[this.activeSourceDraft];
        if (!currentStars || currentStars.size === 0) return;
        
        if (scrollContainer.scrollHeight <= 0) return;
        
        // Small delay to ensure DOM is drawn and offsetTops are accurate
        requestAnimationFrame(() => {
            const scrollHeight = scrollContainer.scrollHeight;
            
            currentStars.forEach(idx => {
                const cell = scrollContainer.children[idx];
                if (!cell) return;
                
                const topPct = (cell.offsetTop / scrollHeight) * 100;
                
                const starMarker = document.createElement('div');
                starMarker.className = 'dm-minimap-star';
                starMarker.style.top = `${topPct}%`;
                
                container.appendChild(starMarker);
            });
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
