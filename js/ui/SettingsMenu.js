import { settings } from '../state/AppSettings.js'; 
import { OpenAIClient } from '../api/OpenAIClient.js';
import { CloudSyncManager } from '../storage/CloudSyncManager.js';

export class SettingsMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.globalModal = document.getElementById('settings-modal');
        this.chatModal = document.getElementById('chat-settings-modal');
        this.choicesModal = document.getElementById('choices-settings-modal');
        this.bindEvents();
        this.populateUI();
        this.cloudSync = new CloudSyncManager();
        this.cloudSync.onAuthStateChanged = (isLoggedIn) => {
            this.renderAuthUI();
            this.refreshSlotList();
        };
    }

    bindEvents() {
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.globalModal.classList.remove('hidden');
            this.refreshSlotList(); 
        });
        document.getElementById('btn-close-settings').addEventListener('click', () => this.closeAndSave());
        
        document.getElementById('btn-chat-settings').addEventListener('click', () => {
            this.populateUI(); 
            this.chatModal.classList.remove('hidden');
        });
        document.getElementById('btn-close-chat-settings').addEventListener('click', () => {
            this.closeAndSaveChatSettings();
        });

        // Tab Selectors
        document.getElementById('settings-page-selector').addEventListener('change', (e) => {
            this.globalModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });
        document.getElementById('chat-settings-page-selector').addEventListener('change', (e) => {
            this.chatModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });
        document.getElementById('choices-page-selector').addEventListener('change', (e) => {
            this.choicesModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });

        document.getElementById('set-parallel-count').addEventListener('change', () => this.renderBatchRows());
        document.getElementById('set-choice-parallel-count').addEventListener('change', () => this.renderChoiceBatchRows());
        document.getElementById('set-regex-count').addEventListener('change', () => this.renderRegexRows());

        document.getElementById('btn-fetch-models').addEventListener('click', () => this.handleFetchModels());
        document.getElementById('btn-manage-favorites').addEventListener('click', () => {
            document.getElementById('favorites-container').classList.toggle('hidden');
            this.renderFavoritesList();
        });
        
        document.getElementById('btn-toggle-anote-history').addEventListener('click', () => {
            const container = document.getElementById('anote-history-container');
            container.classList.toggle('hidden');
            if (!container.classList.contains('hidden')) this.renderAnoteHistory();
        });

        document.getElementById('select-model').addEventListener('change', (e) => {
            document.getElementById('set-model').value = e.target.value;
            const draft1Txt = document.getElementById('batch-model-txt-primary');
            if (draft1Txt) draft1Txt.value = e.target.value;
        });

        document.getElementById('select-summarize-model').addEventListener('change', (e) => {
            document.getElementById('set-summarize-model-txt').value = e.target.value;
        });

        // Choices Modal Logic
        document.getElementById('btn-close-choices-settings').addEventListener('click', () => {
            this.closeAndSaveChoicesSettings();
        });
        document.getElementById('btn-edit-choices-toggle').addEventListener('click', () => {
            const isEditing = !document.getElementById('choices-prompt-edit-container').classList.contains('hidden');
            if (isEditing) {
                document.getElementById('choices-prompt-edit-container').classList.add('hidden');
                document.getElementById('choices-prompt-btn-container').classList.remove('hidden');
            } else {
                document.getElementById('choices-prompt-edit-textarea').value = settings.choicesPrompts;
                document.getElementById('choices-prompt-edit-container').classList.remove('hidden');
                document.getElementById('choices-prompt-btn-container').classList.add('hidden');
            }
        });
        document.getElementById('btn-save-choices-prompts').addEventListener('click', () => {
            settings.choicesPrompts = document.getElementById('choices-prompt-edit-textarea').value;
            settings.save();
            document.getElementById('choices-prompt-edit-container').classList.add('hidden');
            document.getElementById('choices-prompt-btn-container').classList.remove('hidden');
            this.renderChoicesPromptsList(); 
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

        // Save Slots
        document.getElementById('btn-new-chat').addEventListener('click', async () => {
            if (confirm("Start a new chat in this slot? This will clear the current history but keep your settings.")) {
                this.uiManager.state.clear(false); 
                this.uiManager.activeSlot = this.selectedSlotId;
                await this.uiManager.autoSave();
                this.refreshSlotList();
                this.uiManager.renderAll();
                this.closeAndSave();
            }
        });

        document.getElementById('btn-slot-save').addEventListener('click', async () => {
            if (this.selectedSlotId !== this.uiManager.activeSlot) {
                if (!confirm(`Overwrite Slot ${this.selectedSlotId} with your current story?`)) return;
            }
            this.uiManager.activeSlot = this.selectedSlotId;
            await this.uiManager.autoSave();
            this.refreshSlotList();
        });

        document.getElementById('btn-slot-load').addEventListener('click', async () => {
            await this.uiManager.loadStateFromSlot(this.selectedSlotId);
            this.closeAndSave();
        });
        
        document.getElementById('btn-slot-edit-name').addEventListener('click', async () => {
            const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
            const newName = prompt("Enter slot name:", slot?.name || `Slot ${this.selectedSlotId}`);
            if (newName !== null) {
                if (this.selectedSlotId === this.uiManager.activeSlot) this.uiManager.activeSlotName = newName;
                await this.uiManager.storage.saveSlot(this.selectedSlotId, newName, slot?.description || "", slot?.data || this.uiManager.state.exportData());
                this.refreshSlotList();
            }
        });
        document.getElementById('btn-slot-edit-desc').addEventListener('click', async () => {
            const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
            const newDesc = prompt("Enter slot description:", slot?.description || "");
            if (newDesc !== null) {
                if (this.selectedSlotId === this.uiManager.activeSlot) this.uiManager.activeSlotDesc = newDesc;
                await this.uiManager.storage.saveSlot(this.selectedSlotId, slot?.name || `Slot ${this.selectedSlotId}`, newDesc, slot?.data || this.uiManager.state.exportData());
                this.refreshSlotList();
            }
        });

        document.getElementById('btn-slot-delete').addEventListener('click', async () => {
            if (confirm("Delete this save slot?")) {
                await this.uiManager.storage.deleteSlot(this.selectedSlotId);
                if (this.uiManager.activeSlot === this.selectedSlotId) {
                    this.uiManager.state.clear(true);
                }
                this.refreshSlotList();
                this.uiManager.renderAll();
            }
        });

        const btnTrim = document.getElementById('btn-trim-save');
        if (btnTrim) {
            btnTrim.addEventListener('click', async () => {
                if (confirm("This will permanently delete all alternate parallel drafts, AI reasoning blocks, and undo history for the CURRENT story to save space. Continue?")) {
                    this.uiManager.state.cleanState();
                    await this.uiManager.autoSave();
                    this.uiManager.renderAll();
                    alert("Save trimmed successfully! File size has been reduced.");
                }
            });
        }

        // Exports
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
            
            // Validate existing settings against fetched models
            let missing = [];
            
            if (settings.model && !this.cachedFetchedModels.includes(settings.model)) {
                missing.push(`Default: ${settings.model}`);
                settings.model = this.cachedFetchedModels[0] || '';
            }
            if (settings.summarizeModel && !this.cachedFetchedModels.includes(settings.summarizeModel)) {
                missing.push(`Summarize: ${settings.summarizeModel}`);
                settings.summarizeModel = '';
            }
            settings.parallelOverrides.forEach((ov, i) => {
                if (ov.model && !this.cachedFetchedModels.includes(ov.model)) {
                    missing.push(`Parallel Draft ${i+2}: ${ov.model}`);
                    ov.model = '';
                }
            });
            settings.choiceParallelOverrides.forEach((ov, i) => {
                if (ov.model && !this.cachedFetchedModels.includes(ov.model)) {
                    missing.push(`Choice Model ${i+1}: ${ov.model}`);
                    ov.model = '';
                }
            });
            
            const oldFavCount = settings.favoriteModels.length;
            settings.favoriteModels = settings.favoriteModels.filter(m => this.cachedFetchedModels.includes(m));
            if (oldFavCount > settings.favoriteModels.length) {
                missing.push(`${oldFavCount - settings.favoriteModels.length} Favorited Model(s)`);
            }

            if (missing.length > 0) {
                alert("The following models are no longer available and were reset:\n\n" + missing.join("\n"));
                settings.save();
                this.populateUI(); // Refresh settings UI text fields
            }

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
        const createOptions = (selectEl, selectedVal, includeEmptyOverride = false) => {
            if(!selectEl) return;
            let list = this.cachedFetchedModels || settings.favoriteModels;
            const favs = list.filter(m => settings.favoriteModels.includes(m)).sort();
            const others = list.filter(m => !settings.favoriteModels.includes(m)).sort();

            if (includeEmptyOverride) selectEl.innerHTML = '<option value="">(Use Default Model)</option>';
            else selectEl.innerHTML = '<option value="" disabled selected>Select a model...</option>';

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

        createOptions(document.getElementById('select-model'), document.getElementById('set-model').value);
        createOptions(document.getElementById('select-summarize-model'), document.getElementById('set-summarize-model-txt').value, true);
        createOptions(document.getElementById('batch-model-select-primary'), document.getElementById('set-model').value);
        
        const qrPrimaryTxt = document.getElementById('qr-model-txt-primary');
        if (qrPrimaryTxt) createOptions(document.getElementById('qr-model-select-primary'), qrPrimaryTxt.value, true);
        
        for (let i = 0; i < 4; i++) {
            let txtField = document.getElementById(`batch-model-txt-${i}`);
            let currentVal = txtField ? txtField.value : settings.parallelOverrides[i].model;
            createOptions(document.getElementById(`batch-model-select-${i}`), currentVal);
            
            let choiceTxtField = document.getElementById(`choice-batch-model-txt-${i}`);
            let choiceCurrentVal = choiceTxtField ? choiceTxtField.value : settings.choiceParallelOverrides[i].model;
            createOptions(document.getElementById(`choice-batch-model-select-${i}`), choiceCurrentVal);

            let qrTxtField = document.getElementById(`qr-override-txt-${i}`);
            if (qrTxtField) createOptions(document.getElementById(`qr-model-select-${i}`), qrTxtField.value, true);
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

        document.getElementById('batch-model-select-primary').addEventListener('change', (e) => {
            document.getElementById('batch-model-txt-primary').value = e.target.value;
            document.getElementById('set-model').value = e.target.value; 
        });
        document.getElementById('batch-model-txt-primary').addEventListener('input', (e) => {
            document.getElementById('set-model').value = e.target.value; 
        });

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

    renderChoiceBatchRows() {
        const container = document.getElementById('choice-parallel-rows-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('set-choice-parallel-count').value);

        for (let i = 0; i < count; i++) {
            const ov = settings.choiceParallelOverrides[i] || { enabled: false, model: '' };
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            
            row.innerHTML = `
                <div class="batch-row-top">
                    <span>Model ${i+1} ${i === 0 ? "(Required)" : ""}</span>
                    <label style="flex-direction:row; align-items:center; ${i === 0 ? 'visibility:hidden;' : ''}">
                        <input type="checkbox" id="choice-batch-override-chk-${i}" ${ov.enabled || i === 0 ? 'checked' : ''}> Enable
                    </label>
                </div>
                <div class="batch-row-bottom">
                    <select id="choice-batch-model-select-${i}"><option value="" disabled>Select model...</option></select>
                    <input type="text" id="choice-batch-model-txt-${i}" value="${ov.model}" placeholder="Leave blank for Default Model">
                </div>
            `;
            container.appendChild(row);

            document.getElementById(`choice-batch-model-select-${i}`).addEventListener('change', (e) => {
                document.getElementById(`choice-batch-model-txt-${i}`).value = e.target.value;
            });
        }
        
        this.updateAllModelDropdowns();
    }

    renderChoicesPromptsList() {
        const container = document.getElementById('choices-prompt-btn-container');
        container.innerHTML = '';
        
        const raw = settings.choicesPrompts || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const btn = document.createElement('button');
            btn.className = 'secondary';
            if (settings.activeChoicePromptTitle === title) btn.classList.add('primary');
            
            btn.textContent = title;
            btn.title = content;
            btn.addEventListener('click', () => {
                settings.activeChoicePromptTitle = title;
                settings.activeChoicePromptText = content;
                settings.save();
                this.renderChoicesPromptsList();
                document.getElementById('lbl-active-choice-prompt').textContent = title;
            });
            container.appendChild(btn);
        });
        document.getElementById('lbl-active-choice-prompt').textContent = settings.activeChoicePromptTitle;
    }

    populateChoicesUI() {
        this.renderChoicesPromptsList();
        document.getElementById('set-choice-parallel-enabled').checked = settings.choiceParallelEnabled;
        document.getElementById('set-choice-parallel-count').value = settings.choiceParallelCount;
        this.renderChoiceBatchRows();
    }

    closeAndSaveChoicesSettings() {
        settings.choiceParallelEnabled = document.getElementById('set-choice-parallel-enabled').checked;
        settings.choiceParallelCount = parseInt(document.getElementById('set-choice-parallel-count').value) || 1;
        for (let i = 0; i < settings.choiceParallelCount; i++) {
            const chk = document.getElementById(`choice-batch-override-chk-${i}`);
            const txt = document.getElementById(`choice-batch-model-txt-${i}`);
            if (chk && txt) {
                settings.choiceParallelOverrides[i] = { enabled: chk.checked, model: txt.value.trim() };
            }
        }
        settings.save();
        this.choicesModal.classList.add('hidden');
    }

    renderRegexRows() {
        const tbody = document.getElementById('regex-tbody');
        const count = parseInt(document.getElementById('set-regex-count').value);
        
        const currentData = [];
        for (let i = 0; i < tbody.children.length; i++) {
            currentData.push({
                pattern: document.getElementById(`reg-pat-${i}`).value,
                replacement: document.getElementById(`reg-rep-${i}`).value,
                applyOutgoing: document.getElementById(`reg-out-${i}`).checked,
                applyVisually: document.getElementById(`reg-vis-${i}`).checked
            });
        }

        tbody.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const rx = currentData[i] || settings.regexes[i] || { pattern:'', replacement:'', applyOutgoing:false, applyVisually:true };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:4px;"><input type="text" id="reg-pat-${i}" value="${rx.pattern}" placeholder="/search/g"></td>
                <td style="padding:4px;"><input type="text" id="reg-rep-${i}" value="${rx.replacement}" placeholder="replace"></td>
                <td style="padding:4px; text-align:center;"><input type="checkbox" id="reg-out-${i}" ${rx.applyOutgoing ? 'checked' : ''}></td>
                <td style="padding:4px; text-align:center;"><input type="checkbox" id="reg-vis-${i}" ${rx.applyVisually ? 'checked' : ''}></td>
            `;
            tbody.appendChild(tr);
        }
    }

    renderAnoteHistory() {
        const tbody = document.getElementById('anote-history-tbody');
        tbody.innerHTML = '';
        if (this.uiManager.state.anoteHistory.length === 0) {
            tbody.innerHTML = '<tr><td style="color:var(--text-muted); text-align:center;">History is empty</td></tr>';
            return;
        }

        this.uiManager.state.anoteHistory.forEach(note => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.textContent = note.length > 80 ? note.substring(0, 80) + '...' : note;
            td.title = note;
            tr.addEventListener('click', () => {
                document.getElementById('set-anote-content').value = note;
                document.getElementById('anote-history-container').classList.add('hidden');
            });
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
    }

    async refreshSlotList() {
        this.renderAuthUI(); // Ensure auth UI is drawn

        const listDiv = document.getElementById('slot-list');
        listDiv.innerHTML = '<div style="text-align:center; color:var(--text-muted);">Loading slots...</div>';
        
        const localSlots = await this.uiManager.storage.getAllSlots();
        let cloudSlots = [];
        
        if (this.cloudSync.isLoggedIn()) {
            cloudSlots = await this.cloudSync.fetchCloudSlots();
        }

        listDiv.innerHTML = '';

        localSlots.forEach(slot => {
            const card = document.createElement('div');
            card.className = `slot-card ${slot.id === this.uiManager.activeSlot ? 'active' : ''}`;
            
            // Find matching cloud save
            const cloudFile = cloudSlots.find(f => f.name === `slot_${slot.id}.json`);
            
            const localDate = slot.lastEdited || 0;
            const lastSynced = slot.data ? (slot.data.lastSynced || 0) : 0;
            let cloudDate = cloudFile ? new Date(cloudFile.modifiedTime).getTime() : 0;
            
            let syncStatus = '';
            let statusClass = '';

            if (this.cloudSync.isLoggedIn()) {
                if (!cloudFile && localDate > 0) {
                    syncStatus = '⬆️ Pending Push'; statusClass = 'local-newer';
                } else if (!cloudFile && localDate === 0) {
                    syncStatus = '☁️ Empty';
                } else if (localDate > lastSynced && cloudDate > lastSynced) {
                    syncStatus = '⚠️ Conflict'; statusClass = 'conflict';
                } else if (localDate > lastSynced) {
                    syncStatus = '⬆️ Local Newer'; statusClass = 'local-newer';
                } else if (cloudDate > lastSynced) {
                    syncStatus = '⬇️ Cloud Newer'; statusClass = 'cloud-newer';
                } else {
                    syncStatus = '✔️ Synced'; statusClass = 'synced';
                }
            }

            const dateStr = slot.lastEdited ? new Date(slot.lastEdited).toLocaleString() : 'Empty';
            const msgCount = slot.data && slot.data.history ? slot.data.history.length : 0;

            card.innerHTML = `
                <div class="slot-title">
                    <span>${slot.name} <span class="sync-status ${statusClass}">${syncStatus}</span></span>
                    <span class="slot-meta">Msgs: ${msgCount}</span>
                </div>
                <div class="slot-desc">${slot.description || 'No description'}</div>
                <div class="slot-meta">Last Edit: ${dateStr}</div>
            `;

            if (this.cloudSync.isLoggedIn() && (localDate > 0 || cloudFile)) {
                const syncActions = document.createElement('div');
                syncActions.className = 'sync-actions';
                
                // PUSH BUTTON
                const btnPush = document.createElement('button');
                btnPush.textContent = '⬆️ Push';
                btnPush.onclick = async (e) => {
                    e.stopPropagation();
                    if (syncStatus === '⚠️ Conflict') {
                        const choice = await this.handleSyncConflict(slot, cloudFile);
                        if (choice !== 'local') return; // Cancelled or chose cloud (which they should do via Pull)
                    } else if (syncStatus === '⬇️ Cloud Newer') {
                        if (!confirm(`Warning: The Cloud version is newer. Overwrite Google Drive with your older Local save?`)) return;
                    }
                    btnPush.textContent = '⏳...';
                    
                    // Package the slot to save
                    const payload = {
                        slotName: slot.name,
                        slotDesc: slot.description,
                        data: slot.data || this.uiManager.state.exportData()
                    };
                    
                    await this.cloudSync.pushSlot(slot.id, payload, cloudFile ? cloudFile.id : null);
                    
                    // Update local 'lastSynced' timestamp so we know they match
                    payload.data.lastSynced = Date.now(); 
                    await this.uiManager.storage.saveSlot(slot.id, slot.name, slot.description, payload.data);
                    if (this.uiManager.activeSlot === slot.id) this.uiManager.state.loadFromData(payload.data);
                    
                    this.refreshSlotList();
                };

                // PULL BUTTON
                const btnPull = document.createElement('button');
                btnPull.textContent = '⬇️ Pull';
                btnPull.onclick = async (e) => {
                    e.stopPropagation();
                    if (!cloudFile) return alert("No cloud save exists for this slot.");
                    let finalCloudData = null;

                    if (syncStatus === '⚠️ Conflict') {
                        const choice = await this.handleSyncConflict(slot, cloudFile);
                        if (!choice || choice === 'local') return; // Cancelled or chose local (which they should do via Push)
                        finalCloudData = choice.cloudData; // We already downloaded it in the modal!
                    } else if (syncStatus === '⬆️ Local Newer') {
                        if (!confirm(`Warning: Your Local version has unsaved changes. Overwrite Local save with Google Drive?`)) return;
                    }

                    btnPull.textContent = '⏳...';

                    // Use the pre-downloaded data if we resolved a conflict, otherwise download it now
                    const cloudData = finalCloudData || await this.cloudSync.pullSlot(cloudFile.id);
                    
                    cloudData.data.lastSynced = Date.now();
                    await this.uiManager.storage.saveSlot(slot.id, cloudData.slotName, cloudData.slotDesc, cloudData.data);
                    if (this.uiManager.activeSlot === slot.id) {
                        await this.uiManager.loadStateFromSlot(slot.id);
                    }
                    this.refreshSlotList();
                };

                syncActions.appendChild(btnPull);
                syncActions.appendChild(btnPush);
                card.appendChild(syncActions);
            }

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
        let metaHeader = "=== EXPORT METADATA ===\n";
        let hasMeta = false;

        const sysPrompt = this.uiManager.state.systemPrompt.trim();
        if (sysPrompt) {
            metaHeader += `[Memory / System Prompt]\n${sysPrompt}\n\n`;
            hasMeta = true;
        }

        const summary = this.uiManager.state.summary.trim();
        if (summary) {
            metaHeader += `[Summary]\n${summary}\n\n`;
            hasMeta = true;
        }

        const aNote = this.uiManager.state.anoteContent.trim();
        if (aNote) {
            metaHeader += `[Author's Note]\n${aNote}\n\n`;
            hasMeta = true;
        }

        if (!hasMeta) {
            metaHeader = "";
        } else {
            metaHeader += "=== CONVERSATION ===\n\n";
        }

        const text = this.uiManager.state.history.map((m, i) => {
            let content = this.uiManager.state.getContent(i);
            
            // Handle special system roles cleanly for the export text
            if (m.role === 'aggregation' && m.meta && m.meta.displayInput) {
                content = m.meta.displayInput;
            } else if (m.role === 'choices' && m.extractedChoices) {
                content = m.extractedChoices.map((c, idx) => `${idx + 1}. ${c}`).join('\n');
            }

            return `${m.role.toUpperCase()}:\n${content}\n`;
        }).join('\n');

        const finalOutput = metaHeader + text;

        const blob = new Blob([finalOutput], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `story_export_${Date.now()}.txt`;
        a.click();
    }

    exportJSON() {
        // Wrap the state data with the active slot's name and description
        const payload = {
            slotName: this.uiManager.activeSlotName,
            slotDesc: this.uiManager.activeSlotDesc,
            data: this.uiManager.state.exportData()
        };
        
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
                const parsed = JSON.parse(e.target.result);
                let stateData, name, desc;

                // Detect if it's the new wrapped format or the old raw format
                if (parsed.data && parsed.data.history) {
                    stateData = parsed.data;
                    name = parsed.slotName || file.name;
                    desc = parsed.slotDesc || "Imported";
                } else if (parsed.history) {
                    stateData = parsed;
                    name = file.name;
                    desc = "Imported (Legacy)";
                } else {
                    throw new Error("Invalid save file format.");
                }

                await this.uiManager.storage.saveSlot(this.selectedSlotId, name, desc, stateData);
                this.refreshSlotList();
                
                // If they imported over their currently active slot, load it immediately
                if (this.selectedSlotId === this.uiManager.activeSlot) {
                    await this.uiManager.loadStateFromSlot(this.selectedSlotId);
                }
                
                // Reset the file input so they can import the same file again if needed
                event.target.value = '';
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

        document.getElementById('set-force-think').checked = settings.forceThink;
        document.getElementById('set-stop-seqs').value = settings.stopSequences;
        
        document.getElementById('set-system-prompt').value = this.uiManager.state.systemPrompt;
        document.getElementById('set-anote-template').value = this.uiManager.state.anoteTemplate;
        document.getElementById('set-anote-content').value = this.uiManager.state.anoteContent;
        document.getElementById('set-anote-unit').value = this.uiManager.state.anoteUnit;
        document.getElementById('set-anote-depth').value = this.uiManager.state.anoteDepth;
        
        document.getElementById('set-summary-content').value = this.uiManager.state.summary;
        document.getElementById('set-track-summary').checked = settings.trackSummary;
        document.getElementById('set-summarize-model-txt').value = settings.summarizeModel;
        if (document.getElementById('lbl-active-sum-prompt')) {
            document.getElementById('lbl-active-sum-prompt').textContent = this.uiManager.state.selectedAutoSumPromptTitle;
        }

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

        document.getElementById('num-chars-token').value = settings.charsPerToken;

        document.getElementById('set-display-mode').value = settings.displayMode;
        document.getElementById('set-theme').value = settings.theme;
        document.getElementById('set-visible-ooc').value = settings.visibleOutOfContext;
        document.getElementById('set-render-markdown').checked = settings.renderMarkdown;
        document.getElementById('set-regex-count').value = settings.regexes.length;
        this.renderRegexRows();

        this.updateAllModelDropdowns();
    }

    closeAndSave() {
        settings.apiUrl = document.getElementById('set-api-url').value.trim();
        settings.useChatCompletions = document.getElementById('set-use-chat').checked;
        settings.apiKey = document.getElementById('set-api-key').value.trim();
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

        settings.forceThink = document.getElementById('set-force-think').checked;
        settings.stopSequences = document.getElementById('set-stop-seqs').value;
        
        settings.contextLength = parseInt(document.getElementById('num-context').value);
        settings.maxTokens = parseInt(document.getElementById('num-max-tokens').value);
        settings.charsPerToken = parseFloat(document.getElementById('num-chars-token').value);
        settings.temperature = parseFloat(document.getElementById('num-temp').value);
        settings.minP = parseFloat(document.getElementById('num-min-p').value);
        settings.topP = parseFloat(document.getElementById('num-top-p').value);
        settings.topK = parseInt(document.getElementById('num-top-k').value);
        settings.topA = parseFloat(document.getElementById('num-top-a').value);
        settings.typical = parseFloat(document.getElementById('num-typical').value);
        settings.tfs = parseFloat(document.getElementById('num-tfs').value);
        settings.repPen = parseFloat(document.getElementById('num-rep-pen').value);

        settings.displayMode = document.getElementById('set-display-mode').value;
        settings.theme = document.getElementById('set-theme').value;
        settings.visibleOutOfContext = parseInt(document.getElementById('set-visible-ooc').value);
        settings.renderMarkdown = document.getElementById('set-render-markdown').checked;
        
        const rxCount = parseInt(document.getElementById('set-regex-count').value);
        settings.regexes = [];
        for (let i = 0; i < rxCount; i++) {
            settings.regexes.push({
                pattern: document.getElementById(`reg-pat-${i}`).value,
                replacement: document.getElementById(`reg-rep-${i}`).value,
                applyOutgoing: document.getElementById(`reg-out-${i}`).checked,
                applyVisually: document.getElementById(`reg-vis-${i}`).checked
            });
        }
        
        settings.save();
        
        document.documentElement.setAttribute('data-theme', settings.theme);
        this.uiManager.state.buildPromptPayload(); 
        this.uiManager.renderAll(); 

        this.globalModal.classList.add('hidden');
    }

    closeAndSaveChatSettings() {
        this.uiManager.state.systemPrompt = document.getElementById('set-system-prompt').value;
        this.uiManager.state.anoteTemplate = document.getElementById('set-anote-template').value;
        this.uiManager.state.anoteContent = document.getElementById('set-anote-content').value;
        this.uiManager.state.anoteUnit = document.getElementById('set-anote-unit').value;
        this.uiManager.state.anoteDepth = parseInt(document.getElementById('set-anote-depth').value);

        const currentAnote = this.uiManager.state.anoteContent.trim();
        if (currentAnote) {
            if (this.uiManager.state.anoteHistory[0] !== currentAnote) {
                this.uiManager.state.anoteHistory.unshift(currentAnote);
                if (this.uiManager.state.anoteHistory.length > 10) this.uiManager.state.anoteHistory.length = 10;
            }
        }

        this.uiManager.state.summary = document.getElementById('set-summary-content').value;
        settings.trackSummary = document.getElementById('set-track-summary').checked;
        settings.summarizeModel = document.getElementById('set-summarize-model-txt').value.trim();

        settings.save();
        this.uiManager.autoSave();
        
        this.uiManager.state.buildPromptPayload(); 
        this.uiManager.renderAll();

        this.chatModal.classList.add('hidden');
    }


    renderAuthUI() {
        let authContainer = document.getElementById('auth-container');
        if (!authContainer) {
            // Inject auth container above the slot list if it doesn't exist
            const slotTab = document.getElementById('tab-slots');
            authContainer = document.createElement('div');
            authContainer.id = 'auth-container';
            slotTab.insertBefore(authContainer, slotTab.firstChild);
        }

        if (this.cloudSync.isLoggedIn()) {
            authContainer.innerHTML = `
                <span>☁️ Linked to Google Drive</span>
                <button id="btn-cloud-logout" class="secondary">Sign Out</button>
            `;
            document.getElementById('btn-cloud-logout').onclick = () => this.cloudSync.logout();
        } else {
            authContainer.innerHTML = `
                <span>Google Drive Sync:</span>
                <button id="btn-cloud-login" class="primary">Sign In</button>
            `;
            document.getElementById('btn-cloud-login').onclick = () => {
                this.cloudSync.init(); // Init just before login to ensure library is loaded
                this.cloudSync.login();
            };
        }
    }

    async handleSyncConflict(slot, cloudFile) {
        const modal = document.getElementById('sync-conflict-modal');
        const contentArea = document.getElementById('conflict-content-area');
        const btnLocal = document.getElementById('btn-tab-local');
        const btnCloud = document.getElementById('btn-tab-cloud');
        
        modal.classList.remove('hidden');
        contentArea.innerHTML = '<div style="text-align:center; margin-top:20px;">Fetching cloud data... ⏳</div>';

        // 1. Fetch Cloud Data into memory
        const cloudData = await this.cloudSync.pullSlot(cloudFile.id);
        
        // Helper to generate the preview HTML
        const generatePreview = (dataObj, timestamp) => {
            const dateStr = timestamp ? new Date(timestamp).toLocaleString() : 'Unknown';
            const msgCount = dataObj && dataObj.history ? dataObj.history.length : 0;
            
            let html = `<div class="conflict-meta"><span>Last Edit: ${dateStr}</span><span>Messages: ${msgCount}</span></div>`;
            
            if (msgCount > 0) {
                // Get last 2 messages
                const lastMsgs = dataObj.history.slice(-2);
                lastMsgs.forEach(msg => {
                    let content = "No content";
                    if (msg.drafts && msg.drafts[msg.activeDraftIndex || 0]) {
                        content = msg.drafts[msg.activeDraftIndex || 0].content;
                    }
                    // Truncate long messages for the preview
                    if (content.length > 200) content = content.substring(0, 200) + '...';
                    
                    html += `
                        <div class="conflict-msg ${msg.role}">
                            <div class="conflict-msg-role">${msg.role}</div>
                            <div>${content}</div>
                        </div>
                    `;
                });
            } else {
                html += `<div style="text-align:center; opacity:0.5;">No messages.</div>`;
            }
            return html;
        };

        const localHtml = generatePreview(slot.data, slot.lastEdited);
        const cloudHtml = generatePreview(cloudData.data, new Date(cloudFile.modifiedTime).getTime());

        // 2. Setup Tabs
        const switchTab = (isLocal) => {
            if (isLocal) {
                btnLocal.classList.add('primary'); btnCloud.classList.remove('primary');
                contentArea.innerHTML = localHtml;
            } else {
                btnCloud.classList.add('primary'); btnLocal.classList.remove('primary');
                contentArea.innerHTML = cloudHtml;
            }
        };

        // Default to local view
        switchTab(true);

        btnLocal.onclick = () => switchTab(true);
        btnCloud.onclick = () => switchTab(false);

        // 3. Handle Resolution Promises
        return new Promise((resolve) => {
            document.getElementById('btn-close-conflict').onclick = () => {
                modal.classList.add('hidden');
                resolve(null); // Cancelled
            };
            
            document.getElementById('btn-keep-local').onclick = () => {
                modal.classList.add('hidden');
                resolve('local');
            };
            
            document.getElementById('btn-keep-cloud').onclick = () => {
                modal.classList.add('hidden');
                resolve({ cloudData, cloudFile });
            };
        });
    }
}