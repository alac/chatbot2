export class NotesManager {
    constructor(app) {
        this.app = app;
        this.boardEl = document.getElementById('notes-board');
        
        // Edit Modal
        this.editModal = document.getElementById('note-edit-modal');
        this.editTextarea = document.getElementById('note-edit-textarea');
        this.markdownRender = document.getElementById('note-markdown-render');
        this.btnToggleEdit = document.getElementById('btn-note-toggle-edit');
        
        // Move Modal
        this.btnNoteMove = document.getElementById('btn-note-move');
        this.moveModal = document.getElementById('note-move-modal');
        this.moveList = document.getElementById('note-move-list');
        this.btnNoteMoveClose = document.getElementById('btn-close-note-move');
        
        // Import Logic
        this.importFileInput = document.getElementById('import-notes-file');
        
        this.editingIds = null;
        this.isEditingMode = false;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-note-edit-cancel').addEventListener('click', () => this.closeEditModal());
        document.getElementById('btn-note-edit-save').addEventListener('click', () => this.saveNote());
        
        this.btnToggleEdit.addEventListener('click', () => this.toggleEditMode());
        
        this.btnNoteMove.addEventListener('click', () => this.openMoveModal());
        this.btnNoteMoveClose.addEventListener('click', () => this.closeMoveModal());

        this.importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (Array.isArray(parsed)) {
                        this.app.state.importNotesBoard(parsed);
                        this.app.autoSave();
                        this.renderBoard();
                    } else {
                        alert("Invalid notes format. Expected an array of columns.");
                    }
                } catch (err) {
                    alert("Failed to parse JSON file.");
                }
                this.importFileInput.value = ''; // Reset input
            };
            reader.readAsText(file);
        });
    }

    toggleEditMode() {
        this.isEditingMode = !this.isEditingMode;
        if (this.isEditingMode) {
            // Switch to Edit Mode
            this.markdownRender.classList.add('hidden');
            this.editTextarea.classList.remove('hidden');
            this.btnToggleEdit.textContent = '👁️';
            this.btnToggleEdit.title = 'View';
            this.btnToggleEdit.classList.remove('secondary');
            this.btnToggleEdit.classList.add('primary');
            this.editTextarea.focus();
        } else {
            // Switch to View (Markdown) Mode
            this.markdownRender.classList.remove('hidden');
            this.editTextarea.classList.add('hidden');
            this.btnToggleEdit.textContent = '✏️';
            this.btnToggleEdit.title = 'Edit';
            this.btnToggleEdit.classList.remove('primary');
            this.btnToggleEdit.classList.add('secondary');
            
            const val = this.editTextarea.value;
            const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(marked.parse(val || '')) : marked.parse(val || '');
            this.markdownRender.innerHTML = safeHtml || '<span style="color:var(--text-muted); font-style:italic;">Empty Note</span>';
        }
    }

    renderBoard() {
        if (!this.app.state.notes || this.app.state.notes.length === 0) {
            this.app.state.addNoteColumn('General Notes');
        }
        
        // Dummy Actions Column (Import/Export)
        let html = `
            <div class="notes-column" style="min-width: 160px; max-width: 160px; background: transparent; border: 1px dashed var(--border);">
                <div class="notes-column-header" style="background: transparent; border-bottom: none; justify-content: center; opacity: 0.7;">
                    <span style="font-weight:bold;">Actions</span>
                </div>
                <div class="notes-column-body" style="display: flex; flex-direction: column; gap: 10px; justify-content: flex-start;">
                    <button id="btn-notes-import" class="secondary" title="Import from a JSON file">📥 Import JSON</button>
                    <button id="btn-notes-export" class="secondary" title="Export this board to JSON">📤 Export JSON</button>
                </div>
            </div>
        `;

        this.app.state.notes.forEach(col => {
            let cardsHtml = '';
            col.cards.forEach(card => {
                // Extract the first non-empty line
                const lines = (card.content || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const firstLine = lines.length > 0 ? lines[0] : '<span style="color:var(--text-muted); font-style:italic;">Empty Note</span>';
                
                // Parse markdown inline for bold/italics
                const inlineHtml = window.DOMPurify ? window.DOMPurify.sanitize(marked.parseInline(firstLine)) : marked.parseInline(firstLine);

                cardsHtml += `
                    <div class="note-card" data-col="${col.id}" data-card="${card.id}">
                        ${inlineHtml}
                    </div>
                `;
            });

            html += `
                <div class="notes-column" data-col="${col.id}">
                    <div class="notes-column-header">
                        <input type="text" class="col-title-input" value="${col.title.replace(/"/g, '&quot;')}" placeholder="Column Title">
                        <div class="notes-header-actions">
                            <button class="close-btn col-add-btn" style="font-size: 1.1em;" title="Add Note">+</button>
                            <button class="close-btn col-del-btn" style="font-size: 1.1em;" title="Delete Column">🗑️</button>
                        </div>
                    </div>
                    <div class="notes-column-body">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        });
        
        html += `<div class="btn-add-col" title="Add Column">+</div>`;
        this.boardEl.innerHTML = html;
        
        // Attach Import / Export Events
        this.boardEl.querySelector('#btn-notes-import').addEventListener('click', () => {
            this.importFileInput.click();
        });
        
        this.boardEl.querySelector('#btn-notes-export').addEventListener('click', () => {
            const dataStr = JSON.stringify(this.app.state.notes, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = (this.app.activeSlotName || 'Story').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `${safeName}.notes.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Attach dynamic event listeners based on the generated HTML
        this.boardEl.querySelectorAll('.notes-column[data-col]').forEach(colEl => {
            const colId = colEl.dataset.col;
            
            const titleInput = colEl.querySelector('.col-title-input');
            titleInput.addEventListener('change', (e) => {
                this.app.state.updateNoteColumnTitle(colId, e.target.value);
                this.app.autoSave();
            });
            
            const addBtn = colEl.querySelector('.col-add-btn');
            addBtn.addEventListener('click', () => this.addNote(colId));
            
            const delBtn = colEl.querySelector('.col-del-btn');
            delBtn.addEventListener('click', () => {
                if (confirm("Delete this entire column and all its notes?")) {
                    this.app.state.deleteNoteColumn(colId);
                    this.app.autoSave();
                    this.renderBoard();
                }
            });
            
            colEl.querySelectorAll('.note-card').forEach(cardEl => {
                const cardId = cardEl.dataset.card;
                this.attachLongPress(cardEl, colId, cardId);
            });
        });
        
        this.boardEl.querySelector('.btn-add-col').addEventListener('click', () => {
            this.app.state.addNoteColumn('New Column');
            this.app.autoSave();
            this.renderBoard();
            setTimeout(() => this.boardEl.scrollLeft = this.boardEl.scrollWidth, 50);
        });
    }

    attachLongPress(el, colId, cardId) {
        let timer, startX, startY;
        
        const start = (e) => {
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            startX = clientX; 
            startY = clientY;
            timer = setTimeout(() => this.openEditModal(colId, cardId), 500);
        };
        
        const move = (e) => {
            if (!startX) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            // Allow slight wiggle, but cancel if sliding/scrolling
            if (Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) {
                clearTimeout(timer);
                startX = null;
            }
        };
        
        const cancel = () => clearTimeout(timer);

        el.addEventListener('mousedown', start);
        el.addEventListener('touchstart', start, { passive: true });
        
        el.addEventListener('mousemove', move);
        el.addEventListener('touchmove', move, { passive: true });
        
        el.addEventListener('mouseup', cancel);
        el.addEventListener('touchend', cancel);
        el.addEventListener('mouseleave', cancel);
    }

    addNote(colId) {
        const newCardId = this.app.state.addNoteCard(colId, '');
        if (newCardId) {
            this.openEditModal(colId, newCardId, true); // true = bypass markdown, force edit mode on new
        }
    }

    openEditModal(colId, cardId, forceEdit = false) {
        this.editingIds = { colId, cardId };
        const col = this.app.state.notes.find(c => c.id === colId);
        const card = col.cards.find(c => c.id === cardId);
        
        this.editTextarea.value = card.content || '';
        this.isEditingMode = forceEdit;
        
        if (this.isEditingMode) {
            this.markdownRender.classList.add('hidden');
            this.editTextarea.classList.remove('hidden');
            this.btnToggleEdit.textContent = '👁️';
            this.btnToggleEdit.title = 'View';
            this.btnToggleEdit.classList.remove('secondary');
            this.btnToggleEdit.classList.add('primary');
        } else {
            this.markdownRender.classList.remove('hidden');
            this.editTextarea.classList.add('hidden');
            this.btnToggleEdit.textContent = '✏️';
            this.btnToggleEdit.title = 'Edit';
            this.btnToggleEdit.classList.remove('primary');
            this.btnToggleEdit.classList.add('secondary');
            
            const val = this.editTextarea.value;
            const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(marked.parse(val || '')) : marked.parse(val || '');
            this.markdownRender.innerHTML = safeHtml || '<span style="color:var(--text-muted); font-style:italic;">Empty Note</span>';
        }

        this.editModal.classList.remove('hidden');
        if (forceEdit) {
            this.editTextarea.focus();
        }
    }

    closeEditModal() {
        this.handleDeletionIfEmpty();
        this.editingIds = null;
        this.editModal.classList.add('hidden');
        this.renderBoard();
    }

    saveNote() {
        if (!this.editingIds) return;
        const { colId, cardId } = this.editingIds;
        this.app.state.updateNoteCard(colId, cardId, this.editTextarea.value);
        this.app.autoSave();
        
        this.handleDeletionIfEmpty();
        this.editingIds = null;
        this.editModal.classList.add('hidden');
        this.renderBoard();
    }

    handleDeletionIfEmpty() {
        if (!this.editingIds) return;
        const { colId, cardId } = this.editingIds;
        
        // Check if the current value of the textarea is effectively empty
        const currentVal = this.editTextarea.value.trim();
        if (currentVal === '') {
            this.app.state.deleteNoteCard(colId, cardId);
            this.app.autoSave();
        }
    }
    
    // --- MOVE LOGIC ---
    
    openMoveModal() {
        if (!this.editingIds) return;
        this.moveList.innerHTML = '';
        const { colId, cardId } = this.editingIds;
        
        this.app.state.notes.forEach(col => {
            if (col.id === colId) return; // Skip the column this card is already in
            
            const row = document.createElement('div');
            row.className = 'setting-row';
            row.style.borderBottom = '1px solid var(--border)';
            row.style.paddingBottom = '8px';
            
            const titleSpan = document.createElement('span');
            titleSpan.style.fontWeight = 'bold';
            titleSpan.textContent = col.title;
            
            const btnMove = document.createElement('button');
            btnMove.className = 'primary';
            btnMove.textContent = 'Move Here ➡️';
            btnMove.onclick = () => this.handleMoveNote(cardId, colId, col.id);
            
            row.appendChild(titleSpan);
            row.appendChild(btnMove);
            this.moveList.appendChild(row);
        });
        
        if (this.moveList.children.length === 0) {
            this.moveList.innerHTML = '<span style="color:var(--text-muted); text-align:center;">No other columns available.</span>';
        }
        
        this.moveModal.classList.remove('hidden');
    }

    closeMoveModal() {
        this.moveModal.classList.add('hidden');
    }

    handleMoveNote(cardId, oldColId, newColId) {
        // Save current changes to the state before moving
        this.app.state.updateNoteCard(oldColId, cardId, this.editTextarea.value);
        
        // Move it
        this.app.state.moveNoteCard(cardId, oldColId, newColId);
        this.app.autoSave();
        
        this.closeMoveModal();
        this.closeEditModal(); // This clears editingIds and re-renders the board
    }
}