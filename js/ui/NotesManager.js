export class NotesManager {
    constructor(app) {
        this.app = app;
        this.boardEl = document.getElementById('notes-board');
        this.editModal = document.getElementById('note-edit-modal');
        this.editTextarea = document.getElementById('note-edit-textarea');
        this.editingIds = null;
        this.saveTimeout = null;
        
        this.resizeObserver = new ResizeObserver(entries => {
            let changed = false;
            for (let entry of entries) {
                const el = entry.target;
                const h = el.offsetHeight;
                const colId = el.dataset.col;
                const cardId = el.dataset.card;
                if (!colId || !cardId) continue;

                const col = this.app.state.notes.find(c => c.id === colId);
                if (col) {
                    const card = col.cards.find(c => c.id === cardId);
                    if (card && card.height !== h && h > 20) {
                        card.height = h;
                        changed = true;
                    }
                }
            }
            if (changed) {
                clearTimeout(this.saveTimeout);
                this.saveTimeout = setTimeout(() => this.app.autoSave(), 500);
            }
        });

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-close-note-edit').addEventListener('click', () => this.closeEditModal());
        document.getElementById('btn-note-edit-cancel').addEventListener('click', () => this.closeEditModal());
        document.getElementById('btn-note-edit-save').addEventListener('click', () => this.saveNote());
        document.getElementById('btn-note-delete').addEventListener('click', () => this.deleteNote());
    }

    renderBoard() {
        if (!this.app.state.notes || this.app.state.notes.length === 0) {
            this.app.state.notes = [{ id: Math.random().toString(36).substr(2, 9), title: 'General Notes', cards: [] }];
        }
        this.boardEl.innerHTML = '';
        
        this.app.state.notes.forEach(col => {
            const colEl = document.createElement('div');
            colEl.className = 'notes-column';
            
            // Header
            const header = document.createElement('div');
            header.className = 'notes-column-header';
            
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = col.title;
            titleInput.placeholder = 'Column Title';
            titleInput.addEventListener('change', (e) => {
                col.title = e.target.value;
                this.app.autoSave();
            });
            
            const delBtn = document.createElement('button');
            delBtn.className = 'close-btn';
            delBtn.style.fontSize = '1.1em';
            delBtn.innerHTML = '🗑️';
            delBtn.title = "Delete Column";
            delBtn.addEventListener('click', () => {
                if (confirm("Delete this entire column and all its notes?")) {
                    this.app.state.notes = this.app.state.notes.filter(c => c.id !== col.id);
                    this.app.autoSave();
                    this.renderBoard();
                }
            });

            header.appendChild(titleInput);
            header.appendChild(delBtn);
            
            // Body
            const body = document.createElement('div');
            body.className = 'notes-column-body';
            
            col.cards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = 'note-card markdown-body';
                cardEl.dataset.col = col.id;
                cardEl.dataset.card = card.id;
                if (card.height) {
                    cardEl.style.height = card.height + 'px';
                }
                
                // Parse markdown
                const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(marked.parse(card.content || '')) : marked.parse(card.content || '');
                cardEl.innerHTML = safeHtml || '<span style="color:var(--text-muted); font-style:italic;">Empty Note</span>';
                
                this.attachLongPress(cardEl, col.id, card.id);
                this.resizeObserver.observe(cardEl);
                
                body.appendChild(cardEl);
            });
            
            // Footer
            const footer = document.createElement('div');
            footer.className = 'notes-column-footer';
            
            const addBtn = document.createElement('button');
            addBtn.className = 'secondary';
            addBtn.style.width = '100%';
            addBtn.textContent = '+ Add Note';
            addBtn.addEventListener('click', () => this.addNote(col.id));
            footer.appendChild(addBtn);
            
            colEl.appendChild(header);
            colEl.appendChild(body);
            colEl.appendChild(footer);
            this.boardEl.appendChild(colEl);
        });
        
        // Add column button
        const addColBtn = document.createElement('div');
        addColBtn.className = 'btn-add-col';
        addColBtn.title = "Add Column";
        addColBtn.textContent = '+';
        addColBtn.addEventListener('click', () => {
            this.app.state.notes.push({ id: Math.random().toString(36).substr(2, 9), title: 'New Column', cards: [] });
            this.app.autoSave();
            this.renderBoard();
            setTimeout(() => this.boardEl.scrollLeft = this.boardEl.scrollWidth, 50);
        });
        this.boardEl.appendChild(addColBtn);
    }

    attachLongPress(el, colId, cardId) {
        let timer, startX, startY;
        
        const start = (e) => {
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
            const rect = el.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            // Ignore if touching the resize handle area (bottom right ~20x20px)
            if (clientX > rect.right - 20 && clientY > rect.bottom - 20) return;
            
            startX = clientX; 
            startY = clientY;
            timer = setTimeout(() => this.openEditModal(colId, cardId), 500);
        };
        
        const move = (e) => {
            if (!startX) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
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
        const newCard = { id: Math.random().toString(36).substr(2, 9), content: '', height: null };
        const col = this.app.state.notes.find(c => c.id === colId);
        if (col) {
            col.cards.push(newCard);
            this.openEditModal(colId, newCard.id);
        }
    }

    openEditModal(colId, cardId) {
        this.editingIds = { colId, cardId };
        const col = this.app.state.notes.find(c => c.id === colId);
        const card = col.cards.find(c => c.id === cardId);
        
        this.editTextarea.value = card.content;
        this.editModal.classList.remove('hidden');
        this.editTextarea.focus();
    }

    closeEditModal() {
        // If a new note is abandoned without any content, remove it.
        if (this.editingIds) {
            const { colId, cardId } = this.editingIds;
            const col = this.app.state.notes.find(c => c.id === colId);
            if (col) {
                const card = col.cards.find(c => c.id === cardId);
                if (card && card.content.trim() === '') {
                    col.cards = col.cards.filter(c => c.id !== cardId);
                    this.app.autoSave();
                }
            }
        }
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
        this.editingIds = null;
        this.editModal.classList.add('hidden');
        this.renderBoard();
    }

    deleteNote() {
        if (!this.editingIds) return;
        if (confirm("Delete this note?")) {
            const { colId, cardId } = this.editingIds;
            const col = this.app.state.notes.find(c => c.id === colId);
            if (col) {
                col.cards = col.cards.filter(c => c.id !== cardId);
                this.app.autoSave();
            }
            this.editingIds = null;
            this.editModal.classList.add('hidden');
            this.renderBoard();
        }
    }
}