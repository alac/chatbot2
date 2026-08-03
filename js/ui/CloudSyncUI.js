import { CloudSyncManager } from '../storage/CloudSyncManager.js';
import { HashUtils } from '../utils/HashUtils.js';

export class CloudSyncUI {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.manager = new CloudSyncManager();
        this.manager.onAuthStateChanged = () => {
            this.renderAuthUI();
            if (this.uiManager.slotManager) this.uiManager.slotManager.refreshSlotList();
        };
    }

    renderAuthUI() {
        let authContainer = document.getElementById('auth-container');
        if (!authContainer) {
            const listDiv = document.getElementById('slot-list');
            if (!listDiv) return;
            authContainer = document.createElement('div');
            authContainer.id = 'auth-container';
            listDiv.parentNode.insertBefore(authContainer, listDiv);
        }

        if (this.manager.isLoggedIn()) {
            authContainer.innerHTML = `
                <span>☁️ Linked to Google Drive</span>
                <button id="btn-cloud-logout" class="secondary">Sign Out</button>
            `;
            document.getElementById('btn-cloud-logout').onclick = () => this.manager.logout();
        } else {
            authContainer.innerHTML = `
                <span style="font-size: 0.9em; font-weight: bold;">Google Drive Sync:</span>
                <button id="btn-cloud-login" class="primary">Sign In</button>
            `;
            document.getElementById('btn-cloud-login').onclick = () => {
                this.manager.init(); 
                this.manager.login();
            };
        }
    }

    async getSyncStatus(localData, localTimestamp, cloudFile) {
        if (!cloudFile && localTimestamp > 0) return { text: '⬆️ Pending Push', class: 'local-newer' };
        if (!cloudFile && localTimestamp === 0) return { text: '☁️ Empty', class: '' };

        // Hash-based equality check
        const localHash = await HashUtils.computeHash(localData);
        const cloudHash = cloudFile.appProperties ? cloudFile.appProperties.hash : null;
        
        if (localHash === cloudHash && localHash !== '') {
            return { text: '✔️ Synced', class: 'synced' };
        }

        // Fallback to Timestamps if hashes differ
        const cloudTimestamp = new Date(cloudFile.modifiedTime).getTime();
        if (localTimestamp > cloudTimestamp) return { text: '⬆️ Local Newer', class: 'local-newer' };
        if (cloudTimestamp > localTimestamp) return { text: '⬇️ Cloud Newer', class: 'cloud-newer' };
        
        return { text: '⚠️ Conflict', class: 'conflict' };
    }

    async handleSyncConflict(localData, localTimestamp, cloudFile, itemType = 'slot') {
        const modal = document.getElementById('sync-conflict-modal');
        const contentArea = document.getElementById('conflict-content-area');
        const btnLocal = document.getElementById('btn-tab-local');
        const btnCloud = document.getElementById('btn-tab-cloud');
        
        modal.classList.remove('hidden');
        contentArea.innerHTML = '<div style="text-align:center; margin-top:20px;">Fetching cloud data... ⏳</div>';

        const cloudDataResponse = await this.manager.pullFile(cloudFile.id);
        const cloudData = itemType === 'settings' ? cloudDataResponse : cloudDataResponse.data;

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
        const cloudHtml = generatePreview(cloudData, new Date(cloudFile.modifiedTime).getTime());

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
            document.getElementById('btn-keep-cloud').onclick = () => { modal.classList.add('hidden'); resolve({ cloudData: cloudDataResponse, cloudFile }); };
        });
    }
}
