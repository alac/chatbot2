export class CloudSyncManager {
    constructor() {
        this.clientId = '363486962157-5ohodi355e3g8fecimitcloar06luj9l.apps.googleusercontent.com'; 
        
        this.token = null;
        this.tokenClient = null;
        this.onAuthStateChanged = null;
    }

    init() {
        if (!window.google) {
            console.error("Google Identity Services failed to load.");
            return;
        }
        
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.appdata',
            callback: (tokenResponse) => {
                if (tokenResponse.error) {
                    console.error("Auth Error:", tokenResponse);
                    return;
                }
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

    isLoggedIn() {
        return this.token !== null;
    }

    async fetchCloudSlots() {
        if (!this.isLoggedIn()) return [];
        const res = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)', {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        const data = await res.json();
        return data.files || [];
    }

    async pullSlot(fileId) {
        if (!this.isLoggedIn()) return null;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        return await res.json();
    }

    async pushSlot(slotId, payload, existingFileId = null) {
        if (!this.isLoggedIn()) return null;

        const metadata = {
            name: `slot_${slotId}.json`,
            parents: existingFileId ? undefined : ['appDataFolder'] // Parents only set on creation
        };

        // Step 1: Create or Update Metadata
        const method = existingFileId ? 'PATCH' : 'POST';
        const url = existingFileId 
            ? `https://www.googleapis.com/drive/v3/files/${existingFileId}`
            : 'https://www.googleapis.com/drive/v3/files';

        const metaRes = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata)
        });
        
        const metaData = await metaRes.json();
        const fileId = metaData.id;

        // Step 2: Upload Content (JSON)
        const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const uploadData = await uploadRes.json();
        return uploadData; // Returns updated metadata including new modifiedTime
    }
}