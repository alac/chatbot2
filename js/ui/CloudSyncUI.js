import { settings } from '../state/AppSettings.js';
import { GithubClient } from '../api/GithubClient.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { SyncEngine } from '../sync/SyncEngine.js';

export class CloudSyncUI {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.bindEvents();
    }

    bindEvents() {
        const modal = document.getElementById('github-sync-modal');
        const btnSave = document.getElementById('btn-save-github-sync');
        const btnClose = document.getElementById('btn-close-github-sync');

        btnClose.onclick = () => {
            modal.classList.add('hidden');
            document.getElementById('github-auth-error').classList.add('hidden');
        };
        
        btnSave.onclick = async () => {
            const pat = document.getElementById('set-github-pat').value.trim();
            const key = document.getElementById('set-encryption-key').value.trim();
            const errDiv = document.getElementById('github-auth-error');
            
            if (!pat || !key) {
                errDiv.textContent = "Both PAT and Password are required.";
                errDiv.classList.remove('hidden');
                return;
            }

            btnSave.textContent = "Verifying...";
            btnSave.disabled = true;

            try {
                await GithubClient.listGists(pat);
                
                settings.githubPAT = pat;
                settings.encryptionKey = key;
                settings.save();
                
                errDiv.classList.add('hidden');
                modal.classList.add('hidden');
                
                if (this.uiManager.slotManager) {
                    this.uiManager.slotManager.refreshSlotList();
                }
            } catch (e) {
                errDiv.textContent = "GitHub Auth failed. Check your PAT and permissions.";
                errDiv.classList.remove('hidden');
            } finally {
                btnSave.textContent = "Save & Connect";
                btnSave.disabled = false;
            }
        };
    }

    renderAuthUI(isLoggedIn, gistsCache = []) {
        const authContainer = document.getElementById('auth-container');
        if (!authContainer) return;
        authContainer.innerHTML = '';

         if (isLoggedIn) {
             authContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; flex-wrap: wrap;">
                    <div style="width: 100%"><span style="font-weight:bold; margin-right:4px;">GitHub Sync</span></div>
                    <button id="btn-cloud-refresh" class="secondary" style="padding: 4px 8px; font-size: 0.85em;" title="Refresh Remote State">🔄 <span class="hide-mobile">Refresh</span></button>
                    <button id="btn-cloud-manage" class="secondary" style="padding: 4px 8px; font-size: 0.85em;" title="Manage Remote">🛠️ <span class="hide-mobile">Manage</span></button>
                    <button id="btn-cloud-sync-all" class="primary" style="padding: 4px 8px; font-size: 0.85em;" title="Smart Sync All">🔄 <span class="hide-mobile">Sync </span>All</button>
                </div>
                <button id="btn-open-github-modal" class="secondary" title="Settings" style="padding: 4px">⚙️</button>
            `;

            document.getElementById('btn-cloud-refresh').onclick = () => {
                const btn = document.getElementById('btn-cloud-refresh');
                const origHtml = btn.innerHTML;
                btn.innerHTML = '⏳';
                this.uiManager.slotManager.refreshSlotList().finally(() => btn.innerHTML = origHtml);
            };
            document.getElementById('btn-cloud-manage').onclick = () => this.uiManager.remoteManagerUI.openModal();
            document.getElementById('btn-cloud-sync-all').onclick = () => this.uiManager.slotManager.syncAll(gistsCache);
        } else {
            authContainer.innerHTML = `
                <span style="font-size: 0.9em; font-weight: bold;">GitHub Sync</span>
                <button id="btn-open-github-modal" class="primary" title="Setup Sync">⚙️ Setup</button>
            `;
        }

        document.getElementById('btn-open-github-modal').onclick = () => {
            document.getElementById('set-github-pat').value = settings.githubPAT;
            document.getElementById('set-encryption-key').value = settings.encryptionKey;
            document.getElementById('github-auth-error').classList.add('hidden');
            document.getElementById('github-sync-modal').classList.remove('hidden');
        };
    }

    isLoggedIn() {
        return !!(settings.githubPAT && settings.encryptionKey);
    }

    getSyncStatus(localTimestamp, cloudGist, currentLocalHash, lastSyncedHash, localHistory) {
        if (!cloudGist && localTimestamp > 0) return { text: '⬆️ Local Only', class: 'local-newer', action: 'PUSH' };
        if (!cloudGist && localTimestamp === 0) return { text: '☁️ Empty', class: '', action: 'NONE' };

        let remoteHead = null;
        const descMatch = cloudGist.description ? cloudGist.description.match(/\|\s*hash:([a-fA-F0-9]+)/) : null;
        if (descMatch) remoteHead = descMatch[1];

        if (!remoteHead) {
            // Legacy V1 Fallback
            const cloudTimestamp = new Date(cloudGist.updated_at).getTime();
            if (Math.abs(localTimestamp - cloudTimestamp) < 5000) return { text: '✔️ Synced', class: 'synced', action: 'SYNCED' };
            if (localTimestamp > cloudTimestamp) return { text: '⬆️ Local Newer', class: 'local-newer', action: 'PUSH' };
            if (cloudTimestamp > localTimestamp) return { text: '⬇️ Cloud Newer', class: 'cloud-newer', action: 'PULL' };
            return { text: '⚠️ Conflict', class: 'conflict', action: 'CONFLICT' };
        }

        // V2 Fast-Forward Detection
        const evalResult = SyncEngine.evaluate(currentLocalHash, lastSyncedHash, localHistory, remoteHead, null);
        
        if (evalResult === 'SYNCED') return { text: '✔️ Synced', class: 'synced', action: 'SYNCED' };
        if (evalResult === 'PUSH') return { text: '⬆️ Local Ahead', class: 'local-newer', action: 'PUSH' };
        
        const cloudTimestamp = new Date(cloudGist.updated_at).getTime();
        if (cloudTimestamp > localTimestamp) return { text: '⬇️ Cloud Ahead', class: 'cloud-newer', action: 'PULL_OR_CONFLICT' };
        
        return { text: '⚠️ Conflict', class: 'conflict', action: 'PULL_OR_CONFLICT' };
    }

    async pushItem(id, filename, baseDescription, rawData, computedHash, syncHistory) {
        if (!this.isLoggedIn()) throw new Error("Not logged in");

        const descriptionWithHash = `${baseDescription} | hash:${computedHash}`;
        const dataStr = JSON.stringify(rawData);
        const encrypted = await CryptoUtils.encryptData(dataStr, settings.encryptionKey);
        
        const v2Payload = {
            format: 'ailite_sync_v2',
            head: computedHash,
            history: syncHistory || [],
            updatedAt: Date.now(),
            encrypted: encrypted
        };
        const contentStr = JSON.stringify(v2Payload);
        
        const gistId = settings.gistMapping[id];
        let res;
        
        if (gistId) {
            res = await GithubClient.updateGist(gistId, filename, contentStr, settings.githubPAT, descriptionWithHash);
        } else {
            res = await GithubClient.createGist(filename, contentStr, descriptionWithHash, settings.githubPAT);
            settings.gistMapping[id] = res.id;
            settings.save();
        }
        
        return new Date(res.updated_at).getTime();
    }

    async pullItem(id, cloudGist) {
        if (!this.isLoggedIn()) throw new Error("Not logged in");
        if (!cloudGist) return null;

        const contentStr = await GithubClient.getGist(cloudGist.id, settings.githubPAT);
        
        let encryptedStr = contentStr;
        let remoteHead = null;
        let remoteHistory = [];

        try {
            const parsed = JSON.parse(contentStr);
            if (parsed.format === 'ailite_sync_v2') {
                encryptedStr = parsed.encrypted;
                remoteHead = parsed.head;
                remoteHistory = parsed.history || [];
            }
        } catch(e) {}

        const decryptedStr = await CryptoUtils.decryptData(encryptedStr, settings.encryptionKey);
        
        return { 
            data: JSON.parse(decryptedStr), 
            timestamp: new Date(cloudGist.updated_at).getTime(),
            remoteHead,
            remoteHistory
        };
    }

    async handleSyncConflict(localData, localTimestamp, cloudGist, itemType = 'slot', preFetchedPullRes = null) {
        const modal = document.getElementById('sync-conflict-modal');
        const contentArea = document.getElementById('conflict-content-area');
        const btnLocal = document.getElementById('btn-tab-local');
        const btnCloud = document.getElementById('btn-tab-cloud');
        
        modal.classList.remove('hidden');
        contentArea.innerHTML = '<div style="text-align:center; margin-top:20px;">Decrypting cloud data... ⏳</div>';

        let pullRes = preFetchedPullRes;
        if (!pullRes) {
            try {
                pullRes = await this.pullItem(cloudGist.id, cloudGist);
            } catch(e) {
                contentArea.innerHTML = `<div style="text-align:center; color:var(--danger); margin-top:20px;">Failed to decrypt cloud data. Check your Encryption Key.</div>`;
                return new Promise((resolve) => {
                    document.getElementById('btn-close-conflict').onclick = () => { modal.classList.add('hidden'); resolve(null); };
                    document.getElementById('btn-keep-local').onclick = () => { modal.classList.add('hidden'); resolve('local'); };
                    document.getElementById('btn-keep-cloud').onclick = () => { modal.classList.add('hidden'); resolve(null); };
                });
            }
        }

        const cloudDataRaw = pullRes.data;
        const cloudData = itemType === 'settings' ? cloudDataRaw : cloudDataRaw.data;

        const generatePreview = (dataObj, timestamp) => {
            const dateStr = timestamp ? new Date(timestamp).toLocaleString() : 'Unknown';
            let html = `<div class="conflict-meta"><span>Last Edit: ${dateStr}</span></div>`;
            
            if (itemType === 'settings') {
                html += `<div style="font-family:monospace; font-size:0.85em; white-space:pre-wrap;">${JSON.stringify(dataObj, null, 2).substring(0, 300)}...</div>`;
            } else {
                const msgCount = dataObj && dataObj.history ? dataObj.history.length : 0;
                if (msgCount > 0) {
                    dataObj.history.slice(-2).forEach(msg => {
                        let content = msg.drafts?.[msg.activeDraftIndex || 0]?.content || "No content";
                        if (content.length > 200) content = content.substring(0, 200) + '...';
                        html += `<div class="conflict-msg ${msg.role}"><div class="conflict-msg-role">${msg.role}</div><div>${content}</div></div>`;
                    });
                } else {
                    html += `<div style="text-align:center; opacity:0.5;">No messages.</div>`;
                }
            }
            return html;
        };

        const localHtml = generatePreview(localData, localTimestamp);
        const cloudHtml = generatePreview(cloudData, pullRes.timestamp);

        const switchTab = (isLocal) => {
            if (isLocal) { btnLocal.classList.add('primary'); btnCloud.classList.remove('primary'); contentArea.innerHTML = localHtml; }
            else { btnCloud.classList.add('primary'); btnLocal.classList.remove('primary'); contentArea.innerHTML = cloudHtml; }
        };

        switchTab(true);
        btnLocal.onclick = () => switchTab(true);
        btnCloud.onclick = () => switchTab(false);

        return new Promise((resolve) => {
            document.getElementById('btn-close-conflict').onclick = () => { modal.classList.add('hidden'); resolve(null); };
            document.getElementById('btn-keep-local').onclick = () => { modal.classList.add('hidden'); resolve('local'); };
            document.getElementById('btn-keep-cloud').onclick = () => { modal.classList.add('hidden'); resolve({ cloudData: pullRes }); };
        });
    }
}