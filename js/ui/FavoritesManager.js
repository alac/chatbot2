import { settings } from '../state/AppSettings.js';

export class FavoritesManager {
    constructor() {
        this.availableModels = [];
        this.showStarredOnly = false;
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-close-favorites').addEventListener('click', () => {
            document.getElementById('favorites-modal').classList.add('hidden');
        });
        
        document.getElementById('fav-search-input').addEventListener('input', () => this.renderList());
        
        document.getElementById('btn-fav-toggle-only').addEventListener('click', (e) => {
            this.showStarredOnly = !this.showStarredOnly;
            e.target.classList.toggle('primary', this.showStarredOnly);
            e.target.classList.toggle('secondary', !this.showStarredOnly);
            this.renderList();
        });

        document.getElementById('btn-fav-clear-all').addEventListener('click', () => {
            if (confirm('Clear all favorite models?')) {
                settings.favoriteModels = [];
                settings.save();
                this.renderList();
                if (window.settingsUI) window.settingsUI.updateAllModelDropdowns();
            }
        });
    }

    open(availableModels) {
        this.availableModels = availableModels || [];
        document.getElementById('fav-search-input').value = '';
        this.showStarredOnly = false;
        
        const toggleBtn = document.getElementById('btn-fav-toggle-only');
        toggleBtn.classList.add('secondary');
        toggleBtn.classList.remove('primary');
        
        document.getElementById('favorites-modal').classList.remove('hidden');
        this.renderList();
    }

    renderList() {
        const listDiv = document.getElementById('favorites-list-container');
        listDiv.innerHTML = '';
        
        const query = document.getElementById('fav-search-input').value.toLowerCase().trim();
        let list = this.availableModels.length > 0 ? this.availableModels : settings.favoriteModels;
        let sortedList = [...new Set(list)];

        // Sort favorited to the top, then alphabetically
        sortedList.sort((a, b) => {
            const aFav = settings.favoriteModels.includes(a);
            const bFav = settings.favoriteModels.includes(b);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return a.localeCompare(b);
        });

        let count = 0;
        sortedList.forEach(m => {
            const isFav = settings.favoriteModels.includes(m);
            if (this.showStarredOnly && !isFav) return;
            if (query && !m.toLowerCase().includes(query)) return;

            count++;
            const row = document.createElement('div');
            row.className = 'favorite-item';
            
            const label = document.createElement('label'); 
            label.textContent = m;
            label.setAttribute('for', `fav-chk-${count}`);
            
            const checkbox = document.createElement('input'); 
            checkbox.type = 'checkbox';
            checkbox.id = `fav-chk-${count}`;
            checkbox.checked = isFav;
            
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked && !settings.favoriteModels.includes(m)) {
                    settings.favoriteModels.push(m);
                } else {
                    settings.favoriteModels = settings.favoriteModels.filter(f => f !== m);
                }
                settings.save();
                if (window.settingsUI) window.settingsUI.updateAllModelDropdowns();
            });
            
            row.appendChild(label); 
            row.appendChild(checkbox); 
            listDiv.appendChild(row);
        });

        if (count === 0) {
            listDiv.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">No models found.</div>';
        }
    }
}