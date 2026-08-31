import { settings } from '../state/AppSettings.js';
import { GithubClient } from '../api/GithubClient.js';
import { SyncEngine } from '../sync/SyncEngine.js';
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
        
        const settingsPayload = settings.getCloudSyncPayload();
        const settingsCurrentHash = await HashUtils.computeHash(settingsPayload);
        
        await this.renderCard(
            listDiv, 
            'settings', 
            '⚙️ Global Settings', 
            'Samplers, UI config, and Models', 
            settingsPayload, 
            settings.lastEdited,
            settingsCurrentHash,
            settings.lastSyncedHash,
            settings.syncHistory,
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

        // 3. Render Story Slots dynamically (Awaiting all hashes in parallel so it doesn't freeze)
        const slotRenderPromises = sortedIds.map(async (slotId) => {
            const localSlot = localSlots.find(s => s.id === slotId);
            const gistId = settings.gistMapping[slotId];
            const cloudGist = cloudGists.find(g => g.id === gistId);
            
            if (!localSlot && !cloudGist) return null;

            let title = `Slot ${slotId}`;
            let subtitle = "";
            let rawSlot = localSlot;
            let currentLocalHash = null;
            
            if (localSlot) {
                const msgCount = localSlot.data?.history?.length || 0;
                title = localSlot.name;
                subtitle = `Msgs: ${msgCount}`;
                currentLocalHash = await HashUtils.computeHash(localSlot.data);
            } else if (cloudGist) {
                const descMatch = cloudGist.description ? cloudGist.description.match(/AILite Slot:\s*(.*?)(?:\s*\||$)/) : null;
                title = descMatch ? descMatch[1] : `Cloud Slot ${slotId}`;
                subtitle = "☁️ Not on this device";
                rawSlot = { name: title, description: "Cloud only save" };
            }
            
            return {
                id: slotId,
                title, subtitle, rawSlot,
                localData: localSlot ? localSlot.data : null,
                localDate: localSlot ? (localSlot.lastEdited || 0) : 0,
                currentLocalHash,
                lastSyncedHash: localSlot ? localSlot.lastSyncedHash : null,
                localHistory: localSlot ? localSlot.syncHistory : [],
                cloudGist,
                cloudFileName: `slot_${slotId}.json`
            };
        });

        const slotRenderData = (await Promise.all(slotRenderPromises)).filter(Boolean);

        for (const s of slotRenderData) {
            await this.renderCard(
                listDiv, s.id, s.title, s.subtitle, 
                s.localData, s.localDate, s.currentLocalHash, s.lastSyncedHash, s.localHistory, 
                s.cloudGist, s.cloudFileName, s.rawSlot
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

    async applyPush(id, isSettings, rawSlot, localData, currentLocalHash, lastSyncedHash, localHistory, cloudFileName) {
        const payload = isSettings ? localData : { slotName: rawSlot.name, slotDesc: rawSlot.description, data: localData };
        
        let newHistory = localHistory || [];
        if (lastSyncedHash && lastSyncedHash !== currentLocalHash) {
            newHistory = [...newHistory, lastSyncedHash];
            if (newHistory.length > 30) newHistory.shift();
        }

        const newTs = await this.uiManager.cloudSyncUI.pushItem(
            id, cloudFileName, 
            isSettings ? 'AILite Settings' : `AILite Slot: ${rawSlot.name}`, 
            payload, currentLocalHash, newHistory
        );
        
        if (isSettings) {
            settings.lastEdited = newTs;
            settings.updateSyncState(currentLocalHash, newHistory);
        } else {
            await this.uiManager.storage.saveSlot(id, rawSlot.name, rawSlot.description, localData, newTs);
            await this.uiManager.storage.updateSlotSyncState(id, currentLocalHash, newHistory);
        }
    }

    async applyPull(id, isSettings, pullRes) {
        if (isSettings) {
            settings.importSettings(pullRes.data);
            settings.lastEdited = pullRes.timestamp;
            settings.updateSyncState(pullRes.remoteHead, pullRes.remoteHistory);
            if (window.settingsUI) window.settingsUI.populateUI();
        } else {
            const dataObj = pullRes.data;
            await this.uiManager.storage.saveSlot(id, dataObj.slotName, dataObj.slotDesc, dataObj.data, pullRes.timestamp);
            await this.uiManager.storage.updateSlotSyncState(id, pullRes.remoteHead, pullRes.remoteHistory);
            
            if (this.uiManager.activeSlot === id) await this.uiManager.loadStateFromSlot(id);
        }
    }

    async executeSync(id, isSettings, rawSlot, localData, localDate, currentLocalHash, lastSyncedHash, localHistory, cloudFile, cloudFileName) {
        const syncStatus = this.uiManager.cloudSyncUI.getSyncStatus(localDate, cloudFile, currentLocalHash, lastSyncedHash, localHistory);
        const action = syncStatus.action;
        
        if (action === 'SYNCED') return 'SKIP';

        if (action === 'PUSH') {
            await this.applyPush(id, isSettings, rawSlot, localData, currentLocalHash, lastSyncedHash, localHistory, cloudFileName);
            return 'PUSH';
        }

        const pullRes = await this.uiManager.cloudSyncUI.pullItem(id, cloudFile);
        if (!pullRes) throw new Error("Failed to pull from cloud.");

        const finalEval = SyncEngine.evaluate(currentLocalHash, lastSyncedHash, localHistory, pullRes.remoteHead, pullRes.remoteHistory);

        if (finalEval === 'PULL') {
            await this.applyPull(id, isSettings, pullRes);
            return 'PULL';
        } 
        
        if (finalEval === 'PUSH') {
            await this.applyPush(id, isSettings, rawSlot, localData, currentLocalHash, lastSyncedHash, localHistory, cloudFileName);
            return 'PUSH';
        }

        const choice = await this.uiManager.cloudSyncUI.handleSyncConflict(localData, localDate, cloudFile, isSettings ? 'settings' : 'slot', pullRes);
        if (choice === 'local') {
            await this.applyPush(id, isSettings, rawSlot, localData, currentLocalHash, lastSyncedHash, localHistory, cloudFileName);
            return 'RESOLVED_PUSH';
        } else if (choice && choice.cloudData) {
            await this.applyPull(id, isSettings, choice.cloudData);
            return 'RESOLVED_PULL';
        }

        return 'SKIP'; 
    }

    async syncAll(cloudGists = []) {
        if (!confirm("Smart Sync ALL local slots and settings? Conflicting items will prompt for resolution.")) return;
        
        const localSlots = await this.uiManager.storage.getAllSlots();
        let successCount = 0;

        try {
            // Settings Sync
            const settingsGist = cloudGists.find(g => g.id === settings.gistMapping['settings']);
            const settingsPayload = settings.getCloudSyncPayload();
            const settingsHash = await HashUtils.computeHash(settingsPayload);
            
            const resSettings = await this.executeSync(
                'settings', true, null, settingsPayload, settings.lastEdited, 
                settingsHash, settings.lastSyncedHash, settings.syncHistory, settingsGist, 'settings_sync.json'
            );
            if (resSettings !== 'SKIP') successCount++;

            // Slots Sync
            const allSlotIds = new Set(localSlots.map(s => s.id));
            for (const id of Object.keys(settings.gistMapping)) if (id !== 'settings') allSlotIds.add(id);

            for (const slotId of allSlotIds) {
                const gist = cloudGists.find(g => g.id === settings.gistMapping[slotId]);
                const localSlot = localSlots.find(s => s.id === slotId);
                
                const localData = localSlot ? localSlot.data : null;
                const localDate = localSlot ? (localSlot.lastEdited || 0) : 0;
                const localHead = localSlot ? await HashUtils.computeHash(localSlot.data) : null;
                const lastSyncedHash = localSlot ? localSlot.lastSyncedHash : null;
                const localHistory = localSlot ? localSlot.syncHistory : [];
                
                const res = await this.executeSync(
                    slotId, false, localSlot, localData, localDate, localHead, lastSyncedHash, localHistory, 
                    gist, `slot_${slotId}.json`
                );
                
                if (res !== 'SKIP') successCount++;
            }
            
            if (successCount > 0) this.refreshSlotList();
            alert(`Sync All Complete! (${successCount} items synced)`);
        } catch(e) {
            alert(`Sync All failed: ${e.message}`);
        }
    }

    async renderCard(container, id, title, subtitle, localData, localDate, currentLocalHash, lastSyncedHash, localHistory, cloudFile, cloudFileName, rawSlot = null) {
        const isSettings = id === 'settings';
        const card = document.createElement('div');
        card.className = `slot-card ${id === (isSettings ? this.selectedSlotId : this.uiManager.activeSlot) ? 'active' : ''}`;
        
        let syncStatus = { text: '', class: '', action: 'NONE' };
        if (this.uiManager.cloudSyncUI.isLoggedIn()) {
            syncStatus = this.uiManager.cloudSyncUI.getSyncStatus(localDate, cloudFile, currentLocalHash, lastSyncedHash, localHistory);
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
            
            const btnSync = document.createElement('button');
            btnSync.className = 'primary';
            btnSync.textContent = '🔄 Sync';
            btnSync.title = 'Smart Sync';
            btnSync.onclick = async (e) => {
                e.stopPropagation();
                if (!localData && !isSettings && !cloudFile) return;

                btnSync.textContent = '⏳...';
                try {
                    await this.executeSync(id, isSettings, rawSlot, localData, localDate, currentLocalHash, lastSyncedHash, localHistory, cloudFile, cloudFileName);
                    this.refreshSlotList(); 
                } catch (err) {
                    alert(`Sync failed: ${err.message}`);
                    btnSync.textContent = '🔄 Sync';
                }
            };

            const btnPull = document.createElement('button');
            btnPull.className = 'secondary';
            btnPull.textContent = '⬇️ Pull';
            btnPull.title = 'Force Pull (Overwrite Local)';
            btnPull.onclick = async (e) => {
                e.stopPropagation();
                if (!cloudFile) return alert("No cloud save exists.");
                if (!confirm("WARNING: Force Pull will permanently overwrite your local save. Continue?")) return;
                
                btnPull.textContent = '⏳...';
                try {
                    const pullRes = await this.uiManager.cloudSyncUI.pullItem(id, cloudFile);
                    await this.applyPull(id, isSettings, pullRes);
                    this.refreshSlotList();
                } catch (err) {
                    alert(`Force Pull failed: ${err.message}`);
                    btnPull.textContent = '⬇️ Pull';
                }
            };

            const btnPush = document.createElement('button');
            btnPush.className = 'secondary';
            btnPush.textContent = '⬆️ Push';
            btnPush.title = 'Force Push (Overwrite Remote)';
            btnPush.onclick = async (e) => {
                e.stopPropagation();
                if (!localData && !isSettings) return alert("Cannot push. Local slot is empty.");
                if (!confirm("WARNING: Force Push will permanently overwrite the cloud save. Continue?")) return;
                
                btnPush.textContent = '⏳...';
                try {
                    await this.applyPush(id, isSettings, rawSlot, localData, currentLocalHash, lastSyncedHash, localHistory, cloudFileName);
                    this.refreshSlotList();
                } catch (err) {
                    alert(`Force Push failed: ${err.message}`);
                    btnPush.textContent = '⬆️ Push';
                }
            };

            syncActions.append(btnSync, btnPull, btnPush);
            card.appendChild(syncActions);
        }

        card.addEventListener('click', () => {
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