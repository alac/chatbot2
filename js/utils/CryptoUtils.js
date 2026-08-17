export class CryptoUtils {
    static async getDerivedKey(password) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", 
            enc.encode(password), 
            { name: "PBKDF2" }, 
            false, 
            ["deriveBits", "deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { 
                name: "PBKDF2", 
                salt: enc.encode("ailite-sync-salt"), 
                iterations: 100000, 
                hash: "SHA-256" 
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    static async encryptData(dataStr, password) {
        const key = await this.getDerivedKey(password);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, 
            key, 
            enc.encode(dataStr)
        );
        
        // Pack IV and Ciphertext together
        const payload = new Uint8Array(iv.length + ciphertext.byteLength);
        payload.set(iv, 0);
        payload.set(new Uint8Array(ciphertext), iv.length);
        
        // Convert to Base64 for transit
        let binary = '';
        payload.forEach(b => binary += String.fromCharCode(b));
        return btoa(binary);
    }

    static async decryptData(base64Str, password) {
        const key = await this.getDerivedKey(password);
        const binary = atob(base64Str);
        
        const payload = new Uint8Array(binary.length);
        for(let i = 0; i < binary.length; i++) {
            payload[i] = binary.charCodeAt(i);
        }
        
        const iv = payload.slice(0, 12);
        const ciphertext = payload.slice(12);
        
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, 
            key, 
            ciphertext
        );
        
        return new TextDecoder().decode(decrypted);
    }
}