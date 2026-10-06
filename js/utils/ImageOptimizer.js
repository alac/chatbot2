export class ImageOptimizer {
    static async optimize(blobOrUrl, maxDim = 512, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    const ratio = Math.min(maxDim / w, maxDim / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('Image load failed'));
            
            if (blobOrUrl.startsWith('data:')) {
                img.src = blobOrUrl;
            } else {
                fetch(blobOrUrl)
                    .then(r => r.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => img.src = reader.result;
                        reader.readAsDataURL(blob);
                    })
                    .catch(e => {
                        // Fallback if CORS prevents blob reading. Won't cache cleanly but works for display.
                        resolve(blobOrUrl);
                    });
            }
        });
    }
}