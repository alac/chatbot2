export class SyncEngine {
    /**
     * Evaluates the sync state comparing the Local Working Tree vs Last Synced vs Remote.
     * 
     * @returns 'SYNCED' | 'PUSH' | 'PULL' | 'PULL_OR_CONFLICT' | 'CONFLICT'
     */
    static evaluate(currentLocalHash, lastSyncedHash, localHistory, remoteHead, remoteHistory) {
        // If current exact state matches remote, we are perfectly synced
        if (currentLocalHash === remoteHead) return 'SYNCED';

        if (!lastSyncedHash && !remoteHead) return 'SYNCED'; // Both brand new
        if (!remoteHead) return 'PUSH';  // Remote is empty, local exists
        if (!lastSyncedHash) return 'PULL'; // Local has no sync history, but remote exists

        const remoteSet = new Set(remoteHistory || []);
        const localSet = new Set(localHistory || []);

        const hasLocalChanges = currentLocalHash !== lastSyncedHash;
        const remoteAdvanced = remoteHead !== lastSyncedHash && remoteSet.has(lastSyncedHash);

        // Remote moved forward, we didn't touch anything locally -> Clean Pull
        if (!hasLocalChanges && remoteAdvanced) return 'PULL';
        
        // We moved forward locally, remote hasn't changed -> Clean Push
        if (hasLocalChanges && !remoteAdvanced && remoteHead === lastSyncedHash) return 'PUSH';

        // If local working tree matches a state in the remote's past (e.g. we reverted locally to an old backup)
        if (remoteSet.has(currentLocalHash)) return 'PULL';

        // If the remote head is somehow in our local past (e.g. remote got restored to an old backup)
        if (localSet.has(remoteHead)) return 'PUSH';

        // If neither has the other's state, and they aren't a clean fast-forward, 
        // we need to pull to check the full remote history if we haven't already.
        if (remoteHistory === null || remoteHistory === undefined) {
            return 'PULL_OR_CONFLICT';
        }

        // Both local and remote advanced from the last synced state independently
        return 'CONFLICT';
    }
}