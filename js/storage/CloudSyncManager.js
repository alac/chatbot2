export class CloudSyncManager {
    constructor() {
        this.clientId = '363486962157-5ohodi355e3g8fecimitcloar06luj9l.apps.googleusercontent.com'; 
        this.token = null;
        this.tokenClient = null;
        this.onAuthStateChanged = null;
    }

    init() {
        if (!window.google) return console.error("Google Identity Services failed to load.");
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.appdata',
            callback: (tokenResponse) => {
                if (tokenResponse.error) return console.error("Auth Error:", tokenResponse);
                this.token = tokenResponse.access_token;
                if (this.onAuthStateChanged) this.onAuthStateChanged(true);
            },
        });
    }

    login() {
        if (this.tokenClient) this.tokenClient.requestAccessToken();
    }

    logout() {
        this.token = null;
        if (this.onAuthStateChanged) this.onAuthStateChanged(false);
    }

    isLoggedIn() { return this.token !== null; }

    async fetchCloudFiles() {
        if (!this.isLoggedIn()) return [];
        // Request appProperties to retrieve the stored Hash
        const res = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,appProperties)', {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        const data = await res.json();
        return data.files || [];
    }

    async pullFile(fileId) {
        if (!this.isLoggedIn()) return null;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        return await res.json();
    }

    async pushFile(fileName, payload, hash, existingFileId = null) {
        if (!this.isLoggedIn()) return null;

        const metadata = {
            name: fileName,
            appProperties: { hash: hash }
        };
        if (!existingFileId) metadata.parents = ['appDataFolder'];

        const url = existingFileId 
            ? `https://www.googleapis.com/drive/v3/files/${existingFileId}`
            : 'https://www.googleapis.com/drive/v3/files';

        const metaRes = await fetch(url, {
            method: existingFileId ? 'PATCH' : 'POST',
            headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        const metaData = await metaRes.json();

        const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${metaData.id}?uploadType=media`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await uploadRes.json();
    }
}