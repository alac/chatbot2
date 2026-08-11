export class NotesManager {
    constructor(app) {
        this.app = app;
        this.boardEl = document.getElementById('notes-board');
        this.editModal = document.getElementById('note-edit-modal');
        this.editTextarea = document.getElementById('note-edit-textarea');
        this.markdownRender = document.getElementById('note-markdown-render');
        this.btnToggleEdit = document.getElementById('btn-note-toggle-edit');
        
        this.editingIds = null;
        this.isEditingMode = false;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-note-edit-cancel').addEventListener('click', () => this.closeEditModal());
        document.getElementById('btn-note-edit-save').addEventListener('click', () => this.saveNote());
        
        this.btnToggleEdit.addEventListener('click', () => this.toggleEditMode());
    }

    toggleEditMode() {
        this.isEditingMode = !this.isEditingMode;
        if (this.isEditingMode) {
            // Switch to Edit Mode
            this.markdownRender.classList.add('hidden');
            this.editTextarea.classList.remove('hidden');
            this.btnToggleEdit.textContent = '👁️ View';
            this.btnToggleEdit.classList.remove('secondary');
            this.btnToggleEdit.classList.add('primary');
            this.editTextarea.focus();
        } else {
            // Switch to View (Markdown) Mode
            this.markdownRender.classList.remove('hidden');
            this.editTextarea.classList.add('hidden');
            this.btnToggleEdit.textContent = '✏️ Edit';
            this.btnToggleEdit.classList.remove('primary');
            this.btnToggleEdit.classList.add('secondary');
            
            const val = this.editTextarea.value;
            const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(marked.parse(val || '')) : marked.parse(val || '');
            this.markdownRender.innerHTML = safeHtml || '<span style="color:var(--text-muted); font-style:italic;">Empty Note</span>';
        }
    }

    renderBoard() {
        if (!this.app.state.notes || this.app.state.notes.length === 0) {
            this.app.state.notes = [{ id: Math.random().toString(36).substr(2, 9), title: 'General Notes', cards: [] }];
        }
        
        let html = '';
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
        
        // Attach dynamic event listeners based on the generated HTML
        this.boardEl.querySelectorAll('.notes-column').forEach(colEl => {
            const colId = colEl.dataset.col;
            
            const titleInput = colEl.querySelector('.col-title-input');
            titleInput.addEventListener('change', (e) => {
                const col = this.app.state.notes.find(c => c.id === colId);
                if (col) {
                    col.title = e.target.value;
                    this.app.autoSave();
                }
            });
            
            const addBtn = colEl.querySelector('.col-add-btn');
            addBtn.addEventListener('click', () => this.addNote(colId));
            
            const delBtn = colEl.querySelector('.col-del-btn');
            delBtn.addEventListener('click', () => {
                if (confirm("Delete this entire column and all its notes?")) {
                    this.app.state.notes = this.app.state.notes.filter(c => c.id !== colId);
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
            this.app.state.notes.push({ id: Math.random().toString(36).substr(2, 9), title: 'New Column', cards: [] });
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
        const newCard = { id: Math.random().toString(36).substr(2, 9), content: '' };
        const col = this.app.state.notes.find(c => c.id === colId);
        if (col) {
            col.cards.push(newCard);
            this.openEditModal(colId, newCard.id, true); // true = bypass markdown, force edit mode on new
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
            this.btnToggleEdit.textContent = '👁️ View';
            this.btnToggleEdit.classList.remove('secondary');
            this.btnToggleEdit.classList.add('primary');
        } else {
            this.markdownRender.classList.remove('hidden');
            this.editTextarea.classList.add('hidden');
            this.btnToggleEdit.textContent = '✏️ Edit';
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
        const col = this.app.state.notes.find(c => c.id === colId);
        if (col) {
            const card = col.cards.find(c => c.id === cardId);
            if (card) {
                card.content = this.editTextarea.value;
                this.app.autoSave();
            }
        }
        this.handleDeletionIfEmpty();
        this.editingIds = null;
        this.editModal.classList.add('hidden');
        this.renderBoard();
    }

    handleDeletionIfEmpty() {
        if (!this.editingIds) return;
        const { colId, cardId } = this.editingIds;
        const col = this.app.state.notes.find(c => c.id === colId);
        if (col) {
            // Check if the current value of the textarea is effectively empty
            const currentVal = this.editTextarea.value.trim();
            if (currentVal === '') {
                col.cards = col.cards.filter(c => c.id !== cardId);
                this.app.autoSave();
            }
        }
    }
}