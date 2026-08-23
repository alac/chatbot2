import { settings } from '../state/AppSettings.js';
import { GithubClient } from '../api/GithubClient.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';

export class RemoteManagerUI {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.modal = document.getElementById('remote-manage-modal');
        this.tbody = document.getElementById('remote-manage-tbody');
        
        document.getElementById('btn-close-remote-manage').addEventListener('click', () => {
            this.modal.classList.add('hidden');
        });
    }

    async openModal() {
        this.modal.classList.remove('hidden');
        this.tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">Fetching from GitHub... ⏳</td></tr>';
        
        try {
            const gists = await GithubClient.listGists(settings.githubPAT);
            this.populateTable(gists);
        } catch (e) {
            this.tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--danger); padding: 20px;">Failed to load gists: ${e.message}</td></tr>`;
        }
    }

    populateTable(gists) {
        this.tbody.innerHTML = '';
        
        // Filter down to gists that look like ours (contains our hash signature, or filename convention)
        const relevantGists = gists.filter(g => {
            const filenames = Object.keys(g.files);
            const isOurs = filenames.some(f => f === 'settings_sync.json' || (f.startsWith('slot_') && f.endsWith('.json')));
            const hasHash = g.description && g.description.includes('| hash:');
            return isOurs || hasHash;
        });

        if (relevantGists.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-muted);">No cloud saves found.</td></tr>';
            return;
        }

        relevantGists.forEach(gist => {
            let title = "Unknown Slot";
            let extractedId = null;
            const filename = Object.keys(gist.files)[0];

            if (gist.description) {
                const descMatch = gist.description.match(/AILite Slot:\s*(.*?)(?:\s*\||$)/);
                if (descMatch) title = descMatch[1];
                else if (gist.description.includes('AILite Settings')) title = "⚙️ Global Settings";
                else title = gist.description.split('|')[0].trim();
            }

            if (filename === 'settings_sync.json') extractedId = 'settings';
            else if (filename && filename.startsWith('slot_') && filename.endsWith('.json')) {
                extractedId = filename.substring(5, filename.length - 5);
            }

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            
            tr.innerHTML = `
                <td style="padding: 8px;"><strong>${title}</strong><br><small style="color: var(--text-muted);">${filename}</small></td>
                <td style="padding: 8px; font-size: 0.9em; color: var(--text-muted);">${new Date(gist.updated_at).toLocaleString()}</td>
            `;

            const tdActions = document.createElement('td');
            tdActions.style.padding = '8px';
            tdActions.style.textAlign = 'right';

            const actionContainer = document.createElement('div');
            actionContainer.style.display = 'flex';
            actionContainer.style.gap = '6px';
            actionContainer.style.justifyContent = 'flex-end';

            const btnDownload = document.createElement('button');
            btnDownload.className = 'secondary';
            btnDownload.style.padding = '4px 8px';
            btnDownload.style.fontSize = '0.85em';
            btnDownload.innerHTML = '📥 Download';
            btnDownload.onclick = () => this.handleDownload(gist, btnDownload);

            const btnDelete = document.createElement('button');
            btnDelete.className = 'danger';
            btnDelete.style.padding = '4px 8px';
            btnDelete.style.fontSize = '0.85em';
            btnDelete.innerHTML = '🗑️ Down & Del';
            btnDelete.onclick = () => this.handleDownloadAndDelete(gist, extractedId, btnDelete);

            actionContainer.appendChild(btnDownload);
            actionContainer.appendChild(btnDelete);
            tdActions.appendChild(actionContainer);
            tr.appendChild(tdActions);

            this.tbody.appendChild(tr);
        });
    }

    async handleDownload(gist, btnElement) {
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = '⏳...';
        btnElement.disabled = true;

        try {
            const encrypted = await GithubClient.getGist(gist.id, settings.githubPAT);
            const decryptedStr = await CryptoUtils.decryptData(encrypted, settings.encryptionKey);
            
            const blob = new Blob([decryptedStr], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            
            const filename = Object.keys(gist.files)[0] || `backup_${gist.id}.json`;
            a.download = filename;
            a.click();
            
            btnElement.innerHTML = '✔️ Done';
            setTimeout(() => { btnElement.innerHTML = originalText; btnElement.disabled = false; }, 2000);
            return true;
        } catch (e) {
            alert(`Download failed. Check your encryption key. Error: ${e.message}`);
            btnElement.innerHTML = originalText;
            btnElement.disabled = false;
            return false;
        }
    }

    async handleDownloadAndDelete(gist, extractedId, btnElement) {
        if (!confirm("Download this JSON and permanently delete the Gist from GitHub? This action cannot be undone.")) return;
        
        const success = await this.handleDownload(gist, btnElement);
        if (success) {
            btnElement.innerHTML = 'Deleting...';
            try {
                await GithubClient.deleteGist(gist.id, settings.githubPAT);
                
                // Cleanup mapping
                if (extractedId && settings.gistMapping[extractedId]) {
                    delete settings.gistMapping[extractedId];
                    settings.save();
                } else {
                    // Fallback to loop just in case it's in the mapping under a weird ID
                    for (let key in settings.gistMapping) {
                        if (settings.gistMapping[key] === gist.id) {
                            delete settings.gistMapping[key];
                            settings.save();
                            break;
                        }
                    }
                }
                
                // Refresh both the modal and the slot UI underneath
                this.openModal();
                if (this.uiManager.slotManager) {
                    this.uiManager.slotManager.refreshSlotList();
                }
            } catch (e) {
                alert(`Deletion failed: ${e.message}`);
                btnElement.innerHTML = '🗑️ Error';
            }
        }
    }
}