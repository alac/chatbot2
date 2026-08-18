import { settings } from '../state/AppSettings.js';
import { GithubClient } from '../api/GithubClient.js';
import { HashUtils } from '../utils/HashUtils.js';

export class SlotManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedSlotId = null;
    }

    async refreshSlotList() {
        const listDiv = document.getElementById('slot-list');
        listDiv.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top: 10px;">Loading... ⏳</div>';
        
        const localSlots = await this.uiManager.storage.getAllSlots();
        let cloudGists = [];
        
        if (this.uiManager.cloudSyncUI.isLoggedIn()) {
            try {
                cloudGists = await GithubClient.listGists(settings.githubPAT);
                
                // === AUTO-HEAL MAPPING FROM CLOUD ===
                // Scans filenames (e.g. slot_123.json) and ensures settings.gistMapping is perfectly up to date
                let mappingUpdated = false;
                for (const gist of cloudGists) {
                    const filenames = Object.keys(gist.files);
                    for (const filename of filenames) {
                        let extractedId = null;
                        if (filename === 'settings_sync.json') extractedId = 'settings';
                        else if (filename.startsWith('slot_') && filename.endsWith('.json')) {
                            extractedId = filename.substring(5, filename.length - 5);
                        }
                        
                        if (extractedId && settings.gistMapping[extractedId] !== gist.id) {
                            settings.gistMapping[extractedId] = gist.id;
                            mappingUpdated = true;
                        }
                    }
                }
                if (mappingUpdated) settings.save();
                // ====================================

            } catch (e) {
                console.error("Failed to fetch gists", e);
                document.getElementById('github-auth-error').textContent = "Connection failed. Check PAT.";
                document.getElementById('github-auth-error').classList.remove('hidden');
            }
        }
        
        this.uiManager.cloudSyncUI.renderAuthUI(this.uiManager.cloudSyncUI.isLoggedIn(), cloudGists);
        listDiv.innerHTML = '';

        // 1. Render Global Settings Card
        const settingsGistId = settings.gistMapping['settings'];
        const settingsCloudGist = cloudGists.find(g => g.id === settingsGistId);
        await this.renderCard(
            listDiv, 
            'settings', 
            '⚙️ Global Settings', 
            'Samplers, UI config, and Models', 
            settings.getCloudSyncPayload(), 
            settings.lastEdited, 
            settingsCloudGist, 
            'settings_sync.json'
        );

        // 2. Build a unified list of Local + Cloud Slot IDs
        const allSlotIds = new Set(localSlots.map(s => s.id));
        for (const [id, gistId] of Object.entries(settings.gistMapping)) {
            if (id !== 'settings') allSlotIds.add(id);
        }

        const sortedIds = Array.from(allSlotIds).sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        // 3. Render Story Slots dynamically
        for (const slotId of sortedIds) {
            const localSlot = localSlots.find(s => s.id === slotId);
            const gistId = settings.gistMapping[slotId];
            const cloudGist = cloudGists.find(g => g.id === gistId);
            
            // Skip rendering if it exists in neither place (e.g. deleted from cloud but stuck in mapping)
            if (!localSlot && !cloudGist) continue;

            let title = `Slot ${slotId}`;
            let subtitle = "";
            let rawSlot = localSlot;
            
            if (localSlot) {
                const msgCount = localSlot.data?.history?.length || 0;
                title = localSlot.name;
                subtitle = `Msgs: ${msgCount}`;
            } else if (cloudGist) {
                // Cloud only slot (Not yet downloaded to this device)
                const descMatch = cloudGist.description ? cloudGist.description.match(/AILite Slot:\s*(.*?)(?:\s*\||$)/) : null;
                title = descMatch ? descMatch[1] : `Cloud Slot ${slotId}`;
                subtitle = "☁️ Not on this device";
                rawSlot = { name: title, description: "Cloud only save" };
            }
            
            await this.renderCard(
                listDiv, 
                slotId, 
                title, 
                subtitle, 
                localSlot ? localSlot.data : null, 
                localSlot ? (localSlot.lastEdited || 0) : 0, 
                cloudGist, 
                `slot_${slotId}.json`, 
                rawSlot
            );
        }

        // 4. Create New Slot Button
        const btnNewSlot = document.createElement('button');
        btnNewSlot.className = 'secondary';
        btnNewSlot.innerHTML = '➕ Create New Save Slot';
        btnNewSlot.style.margin = '4px';
        btnNewSlot.onclick = async () => {
            const name = prompt("Enter a name for the new slot:", "New Story");
            if (name) {
                const newId = Date.now().toString();
                await this.uiManager.storage.saveSlot(newId, name, "", this.uiManager.state.exportData(), Date.now());
                this.refreshSlotList();
            }
        };
        listDiv.appendChild(btnNewSlot);
    }

    async pushAll(cloudGists = []) {
        if (!confirm("Push ALL local slots and settings to GitHub? Synced items will be skipped.")) return;
        
        const localSlots = await this.uiManager.storage.getAllSlots();
        const promises = [];
        let pushedCount = 0;

        // Settings Push Check
        const settingsPayload = settings.getCloudSyncPayload();
        const settingsGist = cloudGists.find(g => g.id === settings.gistMapping['settings']);
        const settingsSyncStatus = await this.uiManager.cloudSyncUI.getSyncStatus(settingsPayload, settings.lastEdited, settingsGist);
        
        if (settingsSyncStatus.class !== 'synced') {
            const settingsHash = await HashUtils.computeHash(settingsPayload);
            promises.push(
                this.uiManager.cloudSyncUI.pushItem('settings', 'settings_sync.json', 'Global Settings', settingsPayload, settingsHash)
                .then(ts => { settings.lastEdited = ts; settings.save(); pushedCount++; })
            );
        }

        // Slots Push Check
        for (const slot of localSlots) {
            const gist = cloudGists.find(g => g.id === settings.gistMapping[slot.id]);
            const syncStatus = await this.uiManager.cloudSyncUI.getSyncStatus(slot.data, slot.lastEdited || 0, gist);
            
            if (syncStatus.class !== 'synced') {
                const slotHash = await HashUtils.computeHash(slot.data);
                const payload = { slotName: slot.name, slotDesc: slot.description, data: slot.data };
                promises.push(
                    this.uiManager.cloudSyncUI.pushItem(slot.id, `slot_${slot.id}.json`, `AILite Slot: ${slot.name}`, payload, slotHash)
                    .then(ts => {
                        pushedCount++;
                        return this.uiManager.storage.saveSlot(slot.id, slot.name, slot.description, slot.data, ts);
                    })
                );
            }
        }

        try {
            await Promise.all(promises);
            if (pushedCount > 0) this.refreshSlotList();
            alert(`Push All Successful! (${pushedCount} items pushed)`);
        } catch(e) {
            alert(`Push All failed: ${e.message}`);
        }
    }

    async pullAll(cloudGists = []) {
        if (!confirm("Pull ALL cloud slots and settings? Synced items will be skipped.")) return;

        let pulledCount = 0;
        try {
            // Settings Pull Check
            const settingsGist = cloudGists.find(g => g.id === settings.gistMapping['settings']);
            if (settingsGist) {
                const settingsPayload = settings.getCloudSyncPayload();
                const syncStatus = await this.uiManager.cloudSyncUI.getSyncStatus(settingsPayload, settings.lastEdited, settingsGist);
                if (syncStatus.class !== 'synced') {
                    const pullRes = await this.uiManager.cloudSyncUI.pullItem('settings', settingsGist);
                    if (pullRes) {
                        settings.importSettings(pullRes.data);
                        settings.lastEdited = pullRes.timestamp;
                        settings.save();
                        if (window.settingsUI) window.settingsUI.populateUI();
                        pulledCount++;
                    }
                }
            }

            // Slots Pull Check
            const localSlots = await this.uiManager.storage.getAllSlots();
            const allSlotIds = new Set(localSlots.map(s => s.id));
            for (const id of Object.keys(settings.gistMapping)) if (id !== 'settings') allSlotIds.add(id);

            for (const slotId of allSlotIds) {
                const gist = cloudGists.find(g => g.id === settings.gistMapping[slotId]);
                if (gist) {
                    const localSlot = localSlots.find(s => s.id === slotId);
                    const localData = localSlot ? localSlot.data : null;
                    const localDate = localSlot ? (localSlot.lastEdited || 0) : 0;

                    const syncStatus = await this.uiManager.cloudSyncUI.getSyncStatus(localData, localDate, gist);
                    if (syncStatus.class !== 'synced') {
                        const pullRes = await this.uiManager.cloudSyncUI.pullItem(slotId, gist);
                        if (pullRes) {
                            await this.uiManager.storage.saveSlot(slotId, pullRes.data.slotName, pullRes.data.slotDesc, pullRes.data.data, pullRes.timestamp);
                            if (this.uiManager.activeSlot === slotId) await this.uiManager.loadStateFromSlot(slotId);
                            pulledCount++;
                        }
                    }
                }
            }
            if (pulledCount > 0) this.refreshSlotList();
            alert(`Pull All Successful! (${pulledCount} items pulled)`);
        } catch(e) {
            alert(`Pull All failed: ${e.message}`);
        }
    }

    async renderCard(container, id, title, subtitle, localData, localDate, cloudFile, cloudFileName, rawSlot = null) {
        const isSettings = id === 'settings';
        const card = document.createElement('div');
        card.className = `slot-card ${id === (isSettings ? this.selectedSlotId : this.uiManager.activeSlot) ? 'active' : ''}`;
        
        let syncStatus = { text: '', class: '' };
        if (this.uiManager.cloudSyncUI.isLoggedIn()) {
            syncStatus = await this.uiManager.cloudSyncUI.getSyncStatus(localData, localDate, cloudFile);
        }

        const dateStr = localDate ? new Date(localDate).toLocaleString() : (isSettings ? 'Now' : 'Empty');
        
        card.innerHTML = `
            <div class="slot-title">
                <span>${title} <span class="sync-status ${syncStatus.class}">${syncStatus.text}</span></span>
                <span class="slot-meta">${subtitle}</span>
            </div>
            ${rawSlot ? `<div class="slot-desc">${rawSlot.description || 'No description'}</div>` : ''}
            <div class="slot-meta last-edit-meta">Last Edit: ${dateStr}</div>
        `;

        if (this.uiManager.cloudSyncUI.isLoggedIn() && (localDate > 0 || cloudFile || isSettings)) {
            const syncActions = document.createElement('div');
            syncActions.className = 'sync-actions';
            
            const btnPush = document.createElement('button');
            btnPush.textContent = '⬆️ Push';
            btnPush.onclick = async (e) => {
                e.stopPropagation();
                if (!localData && !isSettings) return alert("Cannot push. This slot is entirely empty on this device.");

                if (syncStatus.text === '⚠️ Conflict') {
                    const choice = await this.uiManager.cloudSyncUI.handleSyncConflict(localData, localDate, cloudFile, isSettings ? 'settings' : 'slot');
                    if (choice !== 'local') return;
                } else if (syncStatus.text === '⬇️ Cloud Newer') {
                    if (!confirm(`Warning: Cloud version is newer. Overwrite GitHub Gist?`)) return;
                }
                btnPush.textContent = '⏳...';
                
                const hash = await HashUtils.computeHash(localData);
                const payload = isSettings ? localData : { slotName: rawSlot.name, slotDesc: rawSlot.description, data: localData };
                
                try {
                    const newTs = await this.uiManager.cloudSyncUI.pushItem(id, cloudFileName, isSettings ? 'AILite Settings' : `AILite Slot: ${rawSlot.name}`, payload, hash);
                    
                    if (isSettings) {
                        settings.lastEdited = newTs;
                        settings.save();
                    } else {
                        await this.uiManager.storage.saveSlot(id, rawSlot.name, rawSlot.description, localData, newTs);
                    }

                    // Perform instant local UI update to prevent GitHub caching lag
                    const badge = card.querySelector('.sync-status');
                    if (badge) {
                        badge.className = 'sync-status synced';
                        badge.textContent = '✔️ Synced';
                    }
                    const meta = card.querySelector('.last-edit-meta');
                    if (meta) {
                        meta.textContent = `Last Edit: ${new Date(newTs).toLocaleString()}`;
                    }
                    syncStatus = { text: '✔️ Synced', class: 'synced' }; // Update closure state
                } catch (err) {
                    alert(`Push failed: ${err.message}`);
                } finally {
                    btnPush.textContent = '⬆️ Push';
                }
            };

            const btnPull = document.createElement('button');
            btnPull.textContent = '⬇️ Pull';
            btnPull.onclick = async (e) => {
                e.stopPropagation();
                if (!cloudFile) return alert("No cloud save exists.");
                let finalCloudData = null;
                let finalCloudTimestamp = new Date(cloudFile.updated_at).getTime();

                if (syncStatus.text === '⚠️ Conflict') {
                    const choice = await this.uiManager.cloudSyncUI.handleSyncConflict(localData, localDate, cloudFile, isSettings ? 'settings' : 'slot');
                    if (!choice || choice === 'local') return; 
                    finalCloudData = choice.cloudData; 
                } else if (syncStatus.text === '⬆️ Local Newer') {
                    if (!confirm(`Warning: Local version is newer. Overwrite Local save?`)) return;
                }
                btnPull.textContent = '⏳...';

                try {
                    const pullRes = finalCloudData ? { data: finalCloudData, timestamp: finalCloudTimestamp } : await this.uiManager.cloudSyncUI.pullItem(id, cloudFile);
                    
                    if (isSettings) {
                        settings.importSettings(pullRes.data);
                        settings.lastEdited = pullRes.timestamp;
                        settings.save();
                        if (window.settingsUI) window.settingsUI.populateUI();
                    } else {
                        await this.uiManager.storage.saveSlot(id, pullRes.data.slotName, pullRes.data.slotDesc, pullRes.data.data, pullRes.timestamp);
                        if (this.uiManager.activeSlot === id) await this.uiManager.loadStateFromSlot(id);
                    }
                } catch(err) {
                    alert(`Pull failed: ${err.message}`);
                }
                this.refreshSlotList();
            };

            syncActions.append(btnPull, btnPush);
            card.appendChild(syncActions);
        }

        card.addEventListener('click', () => {
            // Can't select/load a slot that doesn't exist locally yet
            if (!localData && !isSettings) return alert("You must Pull this cloud save before you can select it.");

            document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.selectedSlotId = id;
            document.getElementById('selected-slot-label').textContent = `Selected: ${title}`;
            this.renderActionsBar();
        });

        container.appendChild(card);
    }

    renderActionsBar() {
        const actionsContainer = document.getElementById('slot-actions-buttons');
        actionsContainer.innerHTML = '';
        document.getElementById('slot-actions').classList.remove('hidden');

        if (this.selectedSlotId === 'settings') {
            const btnImport = document.createElement('button');
            btnImport.textContent = '📥 Import JSON';
            btnImport.className = 'secondary';
            btnImport.onclick = () => document.getElementById('file-import-json').click();

            const btnExport = document.createElement('button');
            btnExport.textContent = '📤 Export JSON';
            btnExport.className = 'secondary';
            btnExport.title = 'Exports settings including your PAT and Encryption Key';
            btnExport.onclick = () => {
                const blob = new Blob([JSON.stringify(settings.exportSettings(), null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `settings_backup_${Date.now()}.json`;
                a.click();
            };

            const fileInput = document.getElementById('file-import-json');
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    settings.importSettings(JSON.parse(ev.target.result));
                    if (window.settingsUI) window.settingsUI.populateUI();
                    this.refreshSlotList();
                    fileInput.value = '';
                };
                reader.readAsText(file);
            };

            actionsContainer.append(btnImport, btnExport);
        } else {
            actionsContainer.innerHTML = `
                <button id="btn-slot-load" class="primary">📂 Load</button>
                <button id="btn-slot-save" class="primary">💾 Save</button>
                <button id="btn-new-chat" class="secondary">➕ New</button>
                <button id="btn-slot-edit-name" class="secondary">✏️ Name</button>
                <button id="btn-slot-edit-desc" class="secondary">📝 Desc</button>
                <button id="btn-export-txt" class="secondary">📄 TXT</button>
                <button id="btn-export-json" class="secondary">📥 JSON</button>
                <button id="btn-import-json" class="secondary">📤 Import</button>
                <button id="btn-trim-save" class="secondary">🧹 Trim</button>
                <button id="btn-slot-delete" class="danger">🗑️ Delete</button>
            `;

            document.getElementById('btn-slot-load').onclick = () => { 
                this.uiManager.loadStateFromSlot(this.selectedSlotId); 
                document.getElementById('settings-modal').classList.add('hidden'); 
            };
            document.getElementById('btn-slot-save').onclick = () => { 
                this.uiManager.activeSlot = this.selectedSlotId; 
                this.uiManager.autoSave(); 
                this.refreshSlotList(); 
            };
            
            document.getElementById('btn-new-chat').onclick = async () => {
                if (confirm("Start a new chat in this slot? This clears the current history but keeps settings.")) {
                    this.uiManager.state.clear(false); 
                    this.uiManager.activeSlot = this.selectedSlotId;
                    await this.uiManager.autoSave();
                    this.refreshSlotList();
                    this.uiManager.renderAll();
                    document.getElementById('settings-modal').classList.add('hidden');
                }
            };

            document.getElementById('btn-slot-edit-name').onclick = async () => {
                const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
                const newName = prompt("Enter slot name:", slot?.name || `Slot ${this.selectedSlotId}`);
                if (newName !== null) {
                    if (this.selectedSlotId === this.uiManager.activeSlot) this.uiManager.activeSlotName = newName;
                    await this.uiManager.storage.saveSlot(this.selectedSlotId, newName, slot?.description || "", slot?.data || this.uiManager.state.exportData());
                    this.refreshSlotList();
                }
            };

            document.getElementById('btn-slot-edit-desc').onclick = async () => {
                const slot = await this.uiManager.storage.loadSlot(this.selectedSlotId);
                const newDesc = prompt("Enter slot description:", slot?.description || "");
                if (newDesc !== null) {
                    if (this.selectedSlotId === this.uiManager.activeSlot) this.uiManager.activeSlotDesc = newDesc;
                    await this.uiManager.storage.saveSlot(this.selectedSlotId, slot?.name || `Slot ${this.selectedSlotId}`, newDesc, slot?.data || this.uiManager.state.exportData());
                    this.refreshSlotList();
                }
            };

            document.getElementById('btn-export-txt').onclick = () => this.exportText();

            document.getElementById('btn-export-json').onclick = () => {
                const payload = { slotName: this.uiManager.activeSlotName, slotDesc: this.uiManager.activeSlotDesc, data: this.uiManager.state.exportData() };
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
                a.download = `story_save_${Date.now()}.json`;
                a.click();
            };

            const fileInput = document.getElementById('file-import-json');
            document.getElementById('btn-import-json').onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const parsed = JSON.parse(ev.target.result);
                    const stateData = parsed.data || parsed;
                    await this.uiManager.storage.saveSlot(this.selectedSlotId, parsed.slotName || file.name, parsed.slotDesc || "Imported", stateData, Date.now());
                    this.refreshSlotList();
                    if (this.selectedSlotId === this.uiManager.activeSlot) this.uiManager.loadStateFromSlot(this.selectedSlotId);
                    fileInput.value = '';
                };
                reader.readAsText(file);
            };

            document.getElementById('btn-trim-save').onclick = async () => {
                if (confirm("This permanently deletes alternate drafts and AI reasoning from the active story to save space. Continue?")) {
                    this.uiManager.state.cleanState();
                    await this.uiManager.autoSave();
                    this.uiManager.renderAll();
                    alert("Save trimmed successfully!");
                }
            };

            document.getElementById('btn-slot-delete').onclick = async () => {
                if (confirm("Permanently delete this save slot from local storage?")) {
                    await this.uiManager.storage.deleteSlot(this.selectedSlotId);
                    if (settings.gistMapping[this.selectedSlotId]) {
                        delete settings.gistMapping[this.selectedSlotId];
                        settings.save();
                    }
                    if (this.uiManager.activeSlot === this.selectedSlotId) this.uiManager.state.clear(true);
                    this.refreshSlotList();
                    this.uiManager.renderAll();
                }
            };
        }
    }

    exportText() {
        let metaHeader = "=== EXPORT METADATA ===\n";
        let hasMeta = false;

        const sysPrompt = this.uiManager.state.systemPrompt.trim();
        if (sysPrompt) { metaHeader += `[Memory / System Prompt]\n${sysPrompt}\n\n`; hasMeta = true; }

        const summary = this.uiManager.state.summary.trim();
        if (summary) { metaHeader += `[Summary]\n${summary}\n\n`; hasMeta = true; }

        const aNote = this.uiManager.state.anoteContent.trim();
        if (aNote) { metaHeader += `[Author's Note]\n${aNote}\n\n`; hasMeta = true; }

        if (!hasMeta) { metaHeader = ""; } else { metaHeader += "=== CONVERSATION ===\n\n"; }

        const text = this.uiManager.state.history.map((m, i) => {
            let content = this.uiManager.state.getContent(i);
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
}