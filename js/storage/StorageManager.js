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
            request.onsuccess = async (e) => {
                this.db = e.target.result;
                // Run the migration silently before the app finishes booting
                await this.migrateLegacySlots();
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async migrateLegacySlots() {
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.getAll();
            
            req.onsuccess = () => {
                const results = req.result || [];
                
                // Track existing string keys so we don't blind-overwrite
                const stringEntries = new Map(
                    results.filter(r => typeof r.id === 'string').map(r => [r.id, r])
                );
                
                for (const item of results) {
                    // Find old legacy Integer keys (1, 2, 3...)
                    if (typeof item.id === 'number') {
                        const strId = item.id.toString();
                        store.delete(item.id); // Wipe the integer-keyed entry
                        
                        const existingStr = stringEntries.get(strId);
                        
                        // If no string version exists, or if the old Integer version has MORE 
                        // messages (meaning the string version was an accidental empty fallback)
                        // we promote the old Integer data to the String slot.
                        if (!existingStr || (item.messageCount || 0) >= (existingStr.messageCount || 0)) {
                            item.id = strId;
                            store.put(item);
                            stringEntries.set(strId, item);
                        }
                    }
                }
                resolve();
            };
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
                let results = req.result || [];
                
                // Final safety deduplication in case the UI asks for the list 
                // exactly during a micro-transition
                const uniqueMap = new Map();
                results.forEach(r => {
                    const existing = uniqueMap.get(r.id.toString());
                    if (!existing || (r.messageCount > (existing.messageCount || 0))) {
                        uniqueMap.set(r.id.toString(), r);
                    }
                });
                let uniqueResults = Array.from(uniqueMap.values());

                // Fallback for brand new users
                if (uniqueResults.length === 0) {
                    uniqueResults.push({
                        id: '1',
                        name: 'Slot 1',
                        description: '',
                        messageCount: 0,
                        lastEdited: Date.now(),
                        data: null
                    });
                }
                
                // Sort slots chronologically or by ID so the list UI doesn't jump around
                uniqueResults.sort((a, b) => {
                    const numA = parseInt(a.id);
                    const numB = parseInt(b.id);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.id.localeCompare(b.id);
                });

                resolve(uniqueResults);
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