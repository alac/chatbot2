import { settings } from '../state/AppSettings.js'; 
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
            this.refreshSlotList(); 
        });
        document.getElementById('btn-close-settings').addEventListener('click', () => this.closeAndSave());
        
        // Page Selector (replaces tabs)
        document.getElementById('settings-page-selector').addEventListener('change', (e) => {
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const targetId = e.target.value;
            document.getElementById(targetId).classList.add('active');
        });

        // Batch / Parallel dynamic rows
        document.getElementById('set-parallel-count').addEventListener('change', () => this.renderBatchRows());

        // Model Fetching
        document.getElementById('btn-fetch-models').addEventListener('click', () => this.handleFetchModels());
        document.getElementById('btn-manage-favorites').addEventListener('click', () => {
            document.getElementById('favorites-container').classList.toggle('hidden');
            this.renderFavoritesList();
        });
        
        // Sync primary model dropdown to text input (Tab 1)
        document.getElementById('select-model').addEventListener('change', (e) => {
            document.getElementById('set-model').value = e.target.value;
            // Also sync the text input in Draft 1
            const draft1Txt = document.getElementById('batch-model-txt-primary');
            if (draft1Txt) draft1Txt.value = e.target.value;
        });

        // Samplers Sync & Reset
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
        
        // Edit Name & Edit Desc split
        document.getElementById('btn-slot-edit-name').addEventListener('click', async () => {
            const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
            const newName = prompt("Enter slot name:", slot?.name || `Slot ${this.selectedSlotId}`);
            if (newName !== null) {
                await this.uiManager.storage.saveSlot(this.selectedSlotId, newName, slot?.description || "", slot?.data || this.uiManager.state.exportData());
                this.refreshSlotList();
            }
        });
        document.getElementById('btn-slot-edit-desc').addEventListener('click', async () => {
            const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
            const newDesc = prompt("Enter slot description:", slot?.description || "");
            if (newDesc !== null) {
                await this.uiManager.storage.saveSlot(this.selectedSlotId, slot?.name || `Slot ${this.selectedSlotId}`, newDesc, slot?.data || this.uiManager.state.exportData());
                this.refreshSlotList();
            }
        });

        document.getElementById('btn-slot-delete').addEventListener('click', async () => {
            if (confirm("Delete this save slot?")) {
                await this.uiManager.storage.deleteSlot(this.selectedSlotId);
                if (this.uiManager.activeSlot === this.selectedSlotId) {
                    this.uiManager.state.clear();
                }
                this.refreshSlotList();
                this.uiManager.renderAll();
            }
        });

        document.getElementById('btn-export-txt').addEventListener('click', () => this.exportText());
        document.getElementById('btn-export-json').addEventListener('click', () => this.exportJSON());
        
        document.getElementById('btn-import-json').addEventListener('click', () => document.getElementById('file-import-json').click());
        document.getElementById('file-import-json').addEventListener('change', (e) => this.importJSON(e));
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
            this.updateAllModelDropdowns();
            this.renderFavoritesList();
            btn.textContent = "Success!";
        } catch (e) {
            alert(e.message);
            btn.textContent = "Fetch Failed";
        } finally {
            setTimeout(() => { btn.textContent = "Fetch Models"; btn.disabled = false; }, 2000);
        }
    }

    updateAllModelDropdowns() {
        const createOptions = (selectEl, selectedVal) => {
            if(!selectEl) return;
            selectEl.innerHTML = '<option value="" disabled selected>Select a model...</option>';
            let list = this.cachedFetchedModels || settings.favoriteModels;
            const favs = list.filter(m => settings.favoriteModels.includes(m)).sort();
            const others = list.filter(m => !settings.favoriteModels.includes(m)).sort();

            favs.forEach(m => { 
                const opt = document.createElement('option'); 
                opt.value = m; opt.textContent = `⭐ ${m}`; 
                if (m === selectedVal) opt.selected = true;
                selectEl.appendChild(opt); 
            });
            others.forEach(m => { 
                const opt = document.createElement('option'); 
                opt.value = m; opt.textContent = m; 
                if (m === selectedVal) opt.selected = true;
                selectEl.appendChild(opt); 
            });
        };

        // Primary (Tab 1)
        createOptions(document.getElementById('select-model'), document.getElementById('set-model').value);
        
        // Draft 1 (Tab 2)
        createOptions(document.getElementById('batch-model-select-primary'), document.getElementById('set-model').value);

        // Overrides (Tab 2)
        for (let i = 0; i < 4; i++) {
            const txtField = document.getElementById(`batch-model-txt-${i}`);
            const currentVal = txtField ? txtField.value : settings.parallelOverrides[i].model;
            createOptions(document.getElementById(`batch-model-select-${i}`), currentVal);
        }
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
                this.updateAllModelDropdowns();
            });
            row.appendChild(label); row.appendChild(checkbox); listDiv.appendChild(row);
        });
    }

    renderBatchRows() {
        const container = document.getElementById('parallel-rows-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('set-parallel-count').value);

        // Draft 1 (Primary - Syncs with settings.model)
        const primaryRow = document.createElement('div');
        primaryRow.className = 'batch-row-container';
        primaryRow.innerHTML = `
            <div class="batch-row-top">Draft 1 (Primary Model)</div>
            <div class="batch-row-bottom">
                <select id="batch-model-select-primary"><option value="" disabled>Select model...</option></select>
                <input type="text" id="batch-model-txt-primary" value="${settings.model}" placeholder="Model ID">
            </div>
        `;
        container.appendChild(primaryRow);

        // Sync Draft 1 inputs with main model inputs
        document.getElementById('batch-model-select-primary').addEventListener('change', (e) => {
            document.getElementById('batch-model-txt-primary').value = e.target.value;
            document.getElementById('set-model').value = e.target.value; // Sync to Tab 1
        });
        document.getElementById('batch-model-txt-primary').addEventListener('input', (e) => {
            document.getElementById('set-model').value = e.target.value; // Sync to Tab 1
        });

        // Draft 2 to N
        for (let i = 0; i < count - 1; i++) {
            const ov = settings.parallelOverrides[i] || { enabled: false, model: '' };
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            
            row.innerHTML = `
                <div class="batch-row-top">
                    <span>Draft ${i+2}</span>
                    <label style="flex-direction:row; align-items:center;">
                        <input type="checkbox" id="batch-override-chk-${i}" ${ov.enabled ? 'checked' : ''}> Override
                    </label>
                </div>
                <div class="batch-row-bottom">
                    <select id="batch-model-select-${i}"><option value="" disabled>Select model...</option></select>
                    <input type="text" id="batch-model-txt-${i}" value="${ov.model}" placeholder="Model ID">
                </div>
            `;
            container.appendChild(row);

            document.getElementById(`batch-model-select-${i}`).addEventListener('change', (e) => {
                document.getElementById(`batch-model-txt-${i}`).value = e.target.value;
            });
        }
        
        this.updateAllModelDropdowns();
    }

    async refreshSlotList() {
        const listDiv = document.getElementById('slot-list');
        listDiv.innerHTML = '';
        const slots = await this.uiManager.storage.getAllSlots();

        slots.forEach(slot => {
            const card = document.createElement('div');
            card.className = `slot-card ${slot.id === this.uiManager.activeSlot ? 'active' : ''}`;
            
            const dateStr = slot.lastEdited ? new Date(slot.lastEdited).toLocaleString() : 'Empty';
            const msgCount = slot.data ? slot.data.history.length : 0;

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
        const text = this.uiManager.state.history.map(m => {
            let content = m.isBatch ? m.drafts[m.activeDraftIndex].content : m.content;
            return `${m.role.toUpperCase()}:\n${content}\n`;
        }).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `story_export_${Date.now()}.txt`;
        a.click();
    }

    exportJSON() {
        const data = this.uiManager.state.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `story_save_${Date.now()}.json`;
        a.click();
    }

    importJSON(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.history) throw new Error("Invalid save file format. Expected 'history' array.");
                await this.uiManager.storage.saveSlot(this.selectedSlotId, file.name, "Imported", data);
                this.refreshSlotList();
            } catch (err) {
                alert("Failed to import JSON: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    populateUI() {
        document.getElementById('set-api-url').value = settings.apiUrl;
        document.getElementById('set-use-chat').checked = settings.useChatCompletions;
        document.getElementById('set-api-key').value = settings.apiKey;
        document.getElementById('set-model').value = settings.model;
        
        document.getElementById('set-parallel-enabled').checked = settings.parallelEnabled;
        document.getElementById('set-parallel-count').value = settings.parallelCount;
        this.renderBatchRows();

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

        this.updateAllModelDropdowns();
    }

    closeAndSave() {
        settings.apiUrl = document.getElementById('set-api-url').value.trim();
        settings.useChatCompletions = document.getElementById('set-use-chat').checked;
        settings.apiKey = document.getElementById('set-api-key').value.trim();
        
        // Primary Model (can be set from Tab 1 or Draft 1 in Tab 2)
        settings.model = document.getElementById('set-model').value.trim();

        settings.parallelEnabled = document.getElementById('set-parallel-enabled').checked;
        settings.parallelCount = parseInt(document.getElementById('set-parallel-count').value);
        for (let i = 0; i < settings.parallelCount - 1; i++) {
            const chk = document.getElementById(`batch-override-chk-${i}`);
            const txt = document.getElementById(`batch-model-txt-${i}`);
            if (chk && txt) {
                settings.parallelOverrides[i] = { enabled: chk.checked, model: txt.value.trim() };
            }
        }

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