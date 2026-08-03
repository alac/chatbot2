export class HashUtils {
    static async computeHash(dataObj) {
        if (!dataObj) return '';
        const str = JSON.stringify(dataObj);
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
