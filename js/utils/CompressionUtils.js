export class CompressionUtils {
    /**
     * Compresses a string using Gzip and returns a Base64 string.
     */
    static async compressText(text) {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        
        // Use FileReader to natively convert the compressed Blob to a Base64 Data URL
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // reader.result looks like "data:application/octet-stream;base64,H4sIAAA..."
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Decompresses a Gzip-compressed Base64 string back to original text.
     */
    static async decompressText(base64) {
        // Use native fetch to convert Base64 back into a Blob, bypassing JS memory limits
        const res = await fetch("data:application/octet-stream;base64," + base64);
        const blob = await res.blob();
        
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
    }
}
