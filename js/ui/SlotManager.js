import { settings } from '../state/AppSettings.js';
import { HashUtils } from '../utils/HashUtils.js';

export class SlotManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedSlotId = null;
    }

    async refreshSlotList() {
        this.uiManager.cloudSyncUI.renderAuthUI();

        const listDiv = document.getElementById('slot-list');
        listDiv.innerHTML = '<div style="text-align:center; color:var(--text-muted);">Loading slots...</div>';
        
        const localSlots = await this.uiManager.storage.getAllSlots();
        let cloudFiles = [];
        
        if (this.uiManager.cloudSyncUI.manager.isLoggedIn()) {
            cloudFiles = await this.uiManager.cloudSyncUI.manager.fetchCloudFiles();
        }

        listDiv.innerHTML = '';

        // 1. Render Global Settings Card
        const settingsCloudFile = cloudFiles.find(f => f.name === 'settings_sync.json');
        await this.renderCard(
            listDiv, 
            'settings', 
            '⚙️ Global Settings', 
            'Samplers, UI config, and Models', 
            settings.exportSettings(), 
            settings.lastEdited, 
            settingsCloudFile, 
            'settings_sync.json'
        );

        // 2. Render Story Slots
        for (const slot of localSlots) {
            const cloudFile = cloudFiles.find(f => f.name === `slot_${slot.id}.json`);
            const msgCount = slot.data?.history?.length || 0;
            await this.renderCard(
                listDiv, 
                slot.id, 
                slot.name, 
                `Msgs: ${msgCount}`, 
                slot.data, 
                slot.lastEdited || 0, 
                cloudFile, 
                `slot_${slot.id}.json`, 
                slot
            );
        }
    }

    async renderCard(container, id, title, subtitle, localData, localDate, cloudFile, cloudFileName, rawSlot = null) {
        const isSettings = id === 'settings';
        const card = document.createElement('div');
        card.className = `slot-card ${id === (isSettings ? this.selectedSlotId : this.uiManager.activeSlot) ? 'active' : ''}`;
        
        let syncStatus = { text: '', class: '' };
        if (this.uiManager.cloudSyncUI.manager.isLoggedIn()) {
            syncStatus = await this.uiManager.cloudSyncUI.getSyncStatus(localData, localDate, cloudFile);
        }

        const dateStr = localDate ? new Date(localDate).toLocaleString() : 'Empty';
        card.innerHTML = `
            <div class="slot-title">
                <span>${title} <span class="sync-status ${syncStatus.class}">${syncStatus.text}</span></span>
                <span class="slot-meta">${subtitle}</span>
            </div>
            ${rawSlot ? `<div class="slot-desc">${rawSlot.description || 'No description'}</div>` : ''}
            <div class="slot-meta">Last Edit: ${dateStr}</div>
        `;

        // Sync Actions (Push / Pull)
        if (this.uiManager.cloudSyncUI.manager.isLoggedIn() && (localDate > 0 || cloudFile)) {
            const syncActions = document.createElement('div');
            syncActions.className = 'sync-actions';
            
            const btnPush = document.createElement('button');
            btnPush.textContent = '⬆️ Push';
            btnPush.onclick = async (e) => {
                e.stopPropagation();
                if (syncStatus.text === '⚠️ Conflict') {
                    const choice = await this.uiManager.cloudSyncUI.handleSyncConflict(localData, localDate, cloudFile, isSettings ? 'settings' : 'slot');
                    if (choice !== 'local') return;
                } else if (syncStatus.text === '⬇️ Cloud Newer') {
                    if (!confirm(`Warning: Cloud version is newer. Overwrite Google Drive?`)) return;
                }
                btnPush.textContent = '⏳...';
                
                const hash = await HashUtils.computeHash(localData);
                const payload = isSettings ? localData : { slotName: rawSlot.name, slotDesc: rawSlot.description, data: localData };
                
                await this.uiManager.cloudSyncUI.manager.pushFile(cloudFileName, payload, hash, cloudFile?.id);
                this.refreshSlotList();
            };

            const btnPull = document.createElement('button');
            btnPull.textContent = '⬇️ Pull';
            btnPull.onclick = async (e) => {
                e.stopPropagation();
                if (!cloudFile) return alert("No cloud save exists.");
                let finalCloudData = null;

                if (syncStatus.text === '⚠️ Conflict') {
                    const choice = await this.uiManager.cloudSyncUI.handleSyncConflict(localData, localDate, cloudFile, isSettings ? 'settings' : 'slot');
                    if (!choice || choice === 'local') return; 
                    finalCloudData = choice.cloudData; 
                } else if (syncStatus.text === '⬆️ Local Newer') {
                    if (!confirm(`Warning: Local version is newer. Overwrite Local save?`)) return;
                }
                btnPull.textContent = '⏳...';

                const cloudPayload = finalCloudData || await this.uiManager.cloudSyncUI.manager.pullFile(cloudFile.id);
                
                if (isSettings) {
                    settings.importSettings(cloudPayload);
                    if (window.settingsUI) window.settingsUI.populateUI();
                } else {
                    await this.uiManager.storage.saveSlot(id, cloudPayload.slotName, cloudPayload.slotDesc, cloudPayload.data);
                    if (this.uiManager.activeSlot === id) await this.uiManager.loadStateFromSlot(id);
                }
                this.refreshSlotList();
            };

            syncActions.append(btnPull, btnPush);
            card.appendChild(syncActions);
        }

        card.addEventListener('click', () => {
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
            btnExport.onclick = () => {
                const blob = new Blob([JSON.stringify(settings.exportSettings(), null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `settings_backup_${Date.now()}.json`;
                a.click();
            };

            // Hook up the invisible file input for Settings
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
            // Standard Story Slot Actions
            actionsContainer.innerHTML = `
                <button id="btn-slot-load" class="primary">📂 Load</button>
                <button id="btn-slot-save" class="primary">💾 Save</button>
                <button id="btn-new-chat" class="secondary">➕ New Chat</button>
                <button id="btn-slot-edit-name" class="secondary">✏️ Name</button>
                <button id="btn-slot-edit-desc" class="secondary">📝 Desc</button>
                <button id="btn-export-txt" class="secondary">📄 TXT</button>
                <button id="btn-export-json" class="secondary">📥 JSON</button>
                <button id="btn-import-json" class="secondary">📤 Import</button>
                <button id="btn-trim-save" class="secondary">🧹 Trim Save</button>
                <button id="btn-slot-delete" class="danger">🗑️ Delete</button>
            `;

            // Bind existing logic... (simplified here for brevity, matching old SettingsMenu actions)
            document.getElementById('btn-slot-load').onclick = () => { this.uiManager.loadStateFromSlot(this.selectedSlotId); document.getElementById('settings-modal').classList.add('hidden'); };
            document.getElementById('btn-slot-save').onclick = () => { this.uiManager.activeSlot = this.selectedSlotId; this.uiManager.autoSave(); this.refreshSlotList(); };
            ocument.getElementById('btn-export-txt').onclick = () => { this.exportText(); };
            
            const fileInput = document.getElementById('file-import-json');
            document.getElementById('btn-import-json').onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const parsed = JSON.parse(ev.target.result);
                    const stateData = parsed.data || parsed;
                    await this.uiManager.storage.saveSlot(this.selectedSlotId, parsed.slotName || file.name, parsed.slotDesc || "Imported", stateData);
                    this.refreshSlotList();
                    if (this.selectedSlotId === this.uiManager.activeSlot) this.uiManager.loadStateFromSlot(this.selectedSlotId);
                    fileInput.value = '';
                };
                reader.readAsText(file);
            };
            
            // Reattach standard export TXT/JSON functions from old SettingsMenu here
            document.getElementById('btn-export-json').onclick = () => {
                const payload = { slotName: this.uiManager.activeSlotName, slotDesc: this.uiManager.activeSlotDesc, data: this.uiManager.state.exportData() };
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
                a.download = `story_save_${Date.now()}.json`;
                a.click();
            };

            document.getElementById('btn-trim-save').onclick = async () => {
                if (confirm("This will permanently delete all alternate parallel drafts, AI reasoning blocks, and undo history for the CURRENT story to save space. Continue?")) {
                    this.uiManager.state.cleanState();
                    await this.uiManager.autoSave();
                    this.uiManager.renderAll();
                    alert("Save trimmed successfully! File size has been reduced.");
                }
            };

            // Delete, Rename, etc.
            document.getElementById('btn-slot-delete').onclick = async () => {
                if (confirm("Delete this save slot?")) {
                    await this.uiManager.storage.deleteSlot(this.selectedSlotId);
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