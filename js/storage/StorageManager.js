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

    async saveSlot(id, name, desc, storyStateData) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const payload = {
                id: id,
                name: name,
                description: desc,
                lastEdited: Date.now(),
                messageCount: storyStateData.history.length,
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
            const req = store.get(id);
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
                const results = req.result;
                const slots = [];
                for (let i = 1; i <= 10; i++) {
                    const found = results.find(r => r.id === i);
                    slots.push(found || { id: i, name: `Slot ${i}`, description: '', messageCount: 0, lastEdited: 0, data: null });
                }
                resolve(slots);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteSlot(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}