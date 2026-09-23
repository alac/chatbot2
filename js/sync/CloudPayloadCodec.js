import { CompressionUtils } from '../utils/CompressionUtils.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';

export class CloudPayloadCodec {
    /**
     * Encapsulates data into a compressed, encrypted V3 envelope.
     */
    static async pack(data, key, metadata = {}) {
        const json = JSON.stringify(data);
        // Step 1: Compress
        const compressed = await CompressionUtils.compressText(json);
        // Step 2: Encrypt the compressed string
        const encrypted = await CryptoUtils.encryptData(compressed, key);
        
        // Step 3: Wrap in V3 Envelope
        return JSON.stringify({
            format: 'ailite_sync_v3',
            compressed: true,
            head: metadata.head || null,
            history: metadata.history || [],
            updatedAt: Date.now(),
            encrypted: encrypted
        });
    }

    /**
     * Detects version and unwraps any envelope version (V1, V2, V3).
     */
    static async unpack(rawContent, key) {
        let envelope = null;
        try {
            envelope = JSON.parse(rawContent);
        } catch (e) {
            // If it's not JSON, it might be a raw V1 encrypted string
            envelope = rawContent;
        }

        // --- Handle V1 (Raw String) ---
        if (typeof envelope === 'string') {
            const decrypted = await CryptoUtils.decryptData(envelope.replace(/"/g, ''), key);
            return { data: JSON.parse(decrypted), timestamp: null };
        }

        // --- Handle V2 & V3 (JSON Envelopes) ---
        const isV3 = envelope.format === 'ailite_sync_v3' || envelope.compressed;
        const decrypted = await CryptoUtils.decryptData(envelope.encrypted, key);
        
        let finalJson = decrypted;
        if (isV3) {
            // Step 1: Decompress the decrypted string
            finalJson = await CompressionUtils.decompressText(decrypted);
        }

        return {
            data: JSON.parse(finalJson),
            timestamp: envelope.updatedAt || null,
            remoteHead: envelope.head || null,
            remoteHistory: envelope.history || []
        };
    }
}
