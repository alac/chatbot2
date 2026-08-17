export class StorageManager {
    constructor() {
        this.dbName = 'AILiteDB';
        this.storeName = 'slots';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async saveSlot(id, name, desc, storyStateData, customTimestamp = null) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const payload = {
                id: id.toString(),
                name: name,
                description: desc,
                lastEdited: customTimestamp || Date.now(),
                messageCount: storyStateData.history ? storyStateData.history.length : 0,
                data: storyStateData
            };
            const req = store.put(payload);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async loadSlot(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(id.toString());
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllSlots() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.getAll();
            req.onsuccess = () => {
                // Return whatever exists dynamically. No forced 1-10 loop.
                let results = req.result || [];
                // Fallback for brand new users
                if (results.length === 0) {
                    results.push({
                        id: '1',
                        name: 'Slot 1',
                        description: '',
                        messageCount: 0,
                        lastEdited: Date.now(),
                        data: null
                    });
                }
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteSlot(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.delete(id.toString());
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}