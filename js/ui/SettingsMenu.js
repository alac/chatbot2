import { settings } from '../state.js';
import { OpenAIClient } from '../api/OpenAIClient.js';

export class SettingsMenu {
    constructor(uiManager) {
        this.modal = document.getElementById('settings-modal');
        this.uiManager = uiManager;
        this.bindEvents();
        this.populateUI();
    }

    bindEvents() {
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.modal.classList.remove('hidden');
            this.refreshSlotList(); // Update save slots when opened
        });
        document.getElementById('btn-close-settings').addEventListener('click', () => this.closeAndSave());
        
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.add('active');
            });
        });

        document.getElementById('btn-fetch-models').addEventListener('click', () => this.handleFetchModels());
        document.getElementById('btn-manage-favorites').addEventListener('click', () => {
            document.getElementById('favorites-container').classList.toggle('hidden');
            this.renderFavoritesList();
        });
        document.getElementById('select-model').addEventListener('change', (e) => {
            document.getElementById('set-model').value = e.target.value;
        });

        this.bindSamplerPair('slide-context', 'num-context');
        this.bindSamplerPair('slide-max-tokens', 'num-max-tokens');
        this.bindSamplerPair('slide-temp', 'num-temp');
        this.bindSamplerPair('slide-min-p', 'num-min-p');
        this.bindSamplerPair('slide-top-p', 'num-top-p');
        this.bindSamplerPair('slide-top-k', 'num-top-k');
        this.bindSamplerPair('slide-top-a', 'num-top-a');
        this.bindSamplerPair('slide-typical', 'num-typical');
        this.bindSamplerPair('slide-tfs', 'num-tfs');
        this.bindSamplerPair('slide-rep-pen', 'num-rep-pen');

        document.getElementById('btn-neutralize-samplers').addEventListener('click', () => {
            settings.neutralizeSamplers();
            this.populateUI();
        });

        // Save/Load actions
        document.getElementById('btn-slot-save').addEventListener('click', () => this.uiManager.autoSave());
        document.getElementById('btn-slot-load').addEventListener('click', async () => {
            await this.uiManager.loadStateFromSlot(this.selectedSlotId);
            this.closeAndSave();
        });
        document.getElementById('btn-slot-delete').addEventListener('click', async () => {
            if (confirm("Delete this save slot?")) {
                await this.uiManager.storage.deleteSlot(this.selectedSlotId);
                if (this.uiManager.activeSlot === this.selectedSlotId) this.uiManager.state.clear();
                this.refreshSlotList();
                this.uiManager.renderAll();
            }
        });
        document.getElementById('btn-slot-edit').addEventListener('click', async () => {
            const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
            const newName = prompt("Enter slot name:", slot?.name || `Slot ${this.selectedSlotId}`);
            if (newName) {
                await this.uiManager.storage.saveSlot(this.selectedSlotId, newName, slot?.description || "", slot?.data || this.uiManager.state.exportData());
                this.refreshSlotList();
            }
        });
        document.getElementById('btn-export-txt').addEventListener('click', () => this.exportText());
    }

    bindSamplerPair(slideId, numId) {
        const slide = document.getElementById(slideId);
        const num = document.getElementById(numId);
        slide.addEventListener('input', (e) => num.value = e.target.value);
        num.addEventListener('input', (e) => slide.value = e.target.value);
    }

    async handleFetchModels() {
        const btn = document.getElementById('btn-fetch-models');
        btn.textContent = "Fetching...";
        btn.disabled = true;
        settings.apiUrl = document.getElementById('set-api-url').value.trim();
        settings.apiKey = document.getElementById('set-api-key').value.trim();

        try {
            const models = await OpenAIClient.fetchModels();
            this.cachedFetchedModels = models.map(m => m.id || m.name);
            this.updateModelDropdown();
            this.renderFavoritesList();
            btn.textContent = "Success!";
        } catch (e) {
            alert(e.message);
            btn.textContent = "Fetch Failed";
        } finally {
            setTimeout(() => { btn.textContent = "Fetch"; btn.disabled = false; }, 2000);
        }
    }

    updateModelDropdown() {
        const select = document.getElementById('select-model');
        select.innerHTML = '<option value="" disabled selected>Select a model...</option>';
        let list = this.cachedFetchedModels || settings.favoriteModels;
        const favs = list.filter(m => settings.favoriteModels.includes(m)).sort();
        const others = list.filter(m => !settings.favoriteModels.includes(m)).sort();

        favs.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.textContent = `⭐ ${m}`; select.appendChild(opt); });
        others.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.textContent = m; select.appendChild(opt); });
    }

    renderFavoritesList() {
        const listDiv = document.getElementById('favorites-list');
        listDiv.innerHTML = '';
        const list = this.cachedFetchedModels || settings.favoriteModels;
        const sortedList = [...new Set(list)].sort();

        sortedList.forEach(m => {
            const row = document.createElement('div');
            row.className = 'favorite-item';
            const label = document.createElement('span'); label.textContent = m;
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
            checkbox.checked = settings.favoriteModels.includes(m);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked && !settings.favoriteModels.includes(m)) settings.favoriteModels.push(m);
                else settings.favoriteModels = settings.favoriteModels.filter(f => f !== m);
                settings.save();
                this.updateModelDropdown();
            });
            row.appendChild(label); row.appendChild(checkbox); listDiv.appendChild(row);
        });
    }

    async refreshSlotList() {
        const listDiv = document.getElementById('slot-list');
        listDiv.innerHTML = '';
        const slots = await this.uiManager.storage.getAllSlots();

        slots.forEach(slot => {
            const card = document.createElement('div');
            card.className = `slot-card ${slot.id === this.uiManager.activeSlot ? 'active' : ''}`;
            
            const dateStr = slot.lastEdited ? new Date(slot.lastEdited).toLocaleString() : 'Empty';
            const msgCount = slot.data ? slot.messageCount : 0;

            card.innerHTML = `
                <div class="slot-title"><span>${slot.name}</span> <span class="slot-meta">Msgs: ${msgCount}</span></div>
                <div class="slot-desc">${slot.description || 'No description'}</div>
                <div class="slot-meta">Last Edit: ${dateStr}</div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.selectedSlotId = slot.id;
                document.getElementById('slot-actions').classList.remove('hidden');
                document.getElementById('selected-slot-label').textContent = `Selected: ${slot.name}`;
            });

            listDiv.appendChild(card);
        });
    }

    exportText() {
        const text = this.uiManager.state.history.map(m => `${m.role.toUpperCase()}:\n${m.content}\n`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `story_export_${Date.now()}.txt`;
        a.click();
    }

    populateUI() {
        document.getElementById('set-api-url').value = settings.apiUrl;
        document.getElementById('set-use-chat').checked = settings.useChatCompletions;
        document.getElementById('set-api-key').value = settings.apiKey;
        document.getElementById('set-model').value = settings.model;
        
        document.getElementById('set-system-prompt').value = settings.systemPrompt;
        document.getElementById('set-force-think').checked = settings.forceThink;
        document.getElementById('set-anote-content').value = settings.anoteContent;
        document.getElementById('set-anote-unit').value = settings.anoteUnit;
        document.getElementById('set-anote-depth').value = settings.anoteDepth;

        const setPair = (val, slideId, numId) => { document.getElementById(slideId).value = val; document.getElementById(numId).value = val; };
        setPair(settings.contextLength, 'slide-context', 'num-context');
        setPair(settings.maxTokens, 'slide-max-tokens', 'num-max-tokens');
        setPair(settings.temperature, 'slide-temp', 'num-temp');
        setPair(settings.minP, 'slide-min-p', 'num-min-p');
        setPair(settings.topP, 'slide-top-p', 'num-top-p');
        setPair(settings.topK, 'slide-top-k', 'num-top-k');
        setPair(settings.topA, 'slide-top-a', 'num-top-a');
        setPair(settings.typical, 'slide-typical', 'num-typical');
        setPair(settings.tfs, 'slide-tfs', 'num-tfs');
        setPair(settings.repPen, 'slide-rep-pen', 'num-rep-pen');

        this.updateModelDropdown();
    }

    closeAndSave() {
        settings.apiUrl = document.getElementById('set-api-url').value.trim();
        settings.useChatCompletions = document.getElementById('set-use-chat').checked;
        settings.apiKey = document.getElementById('set-api-key').value.trim();
        settings.model = document.getElementById('set-model').value.trim();

        settings.systemPrompt = document.getElementById('set-system-prompt').value;
        settings.forceThink = document.getElementById('set-force-think').checked;
        settings.anoteContent = document.getElementById('set-anote-content').value;
        settings.anoteUnit = document.getElementById('set-anote-unit').value;
        settings.anoteDepth = parseInt(document.getElementById('set-anote-depth').value);

        settings.contextLength = parseInt(document.getElementById('num-context').value);
        settings.maxTokens = parseInt(document.getElementById('num-max-tokens').value);
        settings.temperature = parseFloat(document.getElementById('num-temp').value);
        settings.minP = parseFloat(document.getElementById('num-min-p').value);
        settings.topP = parseFloat(document.getElementById('num-top-p').value);
        settings.topK = parseInt(document.getElementById('num-top-k').value);
        settings.topA = parseFloat(document.getElementById('num-top-a').value);
        settings.typical = parseFloat(document.getElementById('num-typical').value);
        settings.tfs = parseFloat(document.getElementById('num-tfs').value);
        settings.repPen = parseFloat(document.getElementById('num-rep-pen').value);
        
        settings.save();
        this.modal.classList.add('hidden');
    }
}