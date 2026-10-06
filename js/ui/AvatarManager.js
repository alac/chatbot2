export class AvatarManager {
    constructor(app) {
        this.app = app;
        this.bindEvents();
        setTimeout(() => this.updateAvatarDisplay(), 100);
    }

    bindEvents() {
        const container = document.getElementById('avatar-container');
        let holdTimer;
        
        const openMenu = () => {
            if (holdTimer) clearTimeout(holdTimer);
            this.openSelector();
        };

        container.addEventListener('mousedown', () => holdTimer = setTimeout(openMenu, 500));
        container.addEventListener('mouseup', () => clearTimeout(holdTimer));
        container.addEventListener('mouseleave', () => clearTimeout(holdTimer));
        
        container.addEventListener('touchstart', () => holdTimer = setTimeout(openMenu, 500));
        container.addEventListener('touchend', () => clearTimeout(holdTimer));

        container.addEventListener('click', (e) => {
            if (holdTimer) clearTimeout(holdTimer);
            const imgEl = document.getElementById('avatar-main-img');
            if (!imgEl.classList.contains('hidden')) this.openLightbox(imgEl.src);
        });

        document.getElementById('btn-close-lightbox').addEventListener('click', () => {
            document.getElementById('lightbox-modal').classList.add('hidden');
        });
        document.getElementById('btn-close-avatar-sel').addEventListener('click', () => {
            document.getElementById('avatar-selector-modal').classList.add('hidden');
        });
    }

    updateAvatarDisplay() {
        const placeholder = document.getElementById('avatar-placeholder');
        const imgEl = document.getElementById('avatar-main-img');
        let targetImgData = null;

        if (this.app.state.pinnedAvatarId) {
            targetImgData = this.findImageById(this.app.state.pinnedAvatarId);
        }

        if (!targetImgData) {
            for (let i = this.app.state.history.length - 1; i >= 0; i--) {
                const msg = this.app.state.history[i];
                if (msg.role === 'gallery' && msg.galleryData && msg.galleryData.images.length > 0) {
                    const activeIdx = msg.galleryData.activeImageIndex || 0;
                    if (msg.galleryData.images[activeIdx]) {
                        targetImgData = msg.galleryData.images[activeIdx].dataUrl;
                        break;
                    }
                }
            }
        }

        if (targetImgData) {
            imgEl.src = targetImgData;
            imgEl.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            imgEl.src = '';
            imgEl.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    }

    findImageById(id) {
        for (let i = 0; i < this.app.state.history.length; i++) {
            const msg = this.app.state.history[i];
            if (msg.role === 'gallery' && msg.galleryData && msg.galleryData.images) {
                const img = msg.galleryData.images.find(img => img.id === id);
                if (img) return img.dataUrl;
            }
        }
        return null;
    }

    pinAvatar(id) {
        this.app.state.pinnedAvatarId = id;
        this.app.autoSave();
        this.updateAvatarDisplay();
        document.getElementById('avatar-selector-modal').classList.add('hidden');
    }

    unpinAvatar() {
        this.app.state.pinnedAvatarId = null;
        this.app.autoSave();
        this.updateAvatarDisplay();
        document.getElementById('avatar-selector-modal').classList.add('hidden');
    }

    openLightbox(dataUrl) {
        document.getElementById('lightbox-img').src = dataUrl;
        const btnDl = document.getElementById('btn-download-lightbox');
        btnDl.onclick = () => {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `image_${Date.now()}.jpg`;
            a.click();
        };
        document.getElementById('lightbox-modal').classList.remove('hidden');
    }

    openSelector() {
        const grid = document.getElementById('avatar-grid');
        grid.innerHTML = '';
        let foundImages = false;

        const btnUnpin = document.createElement('button');
        btnUnpin.className = 'secondary';
        btnUnpin.style.gridColumn = '1 / -1';
        btnUnpin.style.padding = '12px';
        btnUnpin.textContent = 'Unpin Avatar (Use Most Recent)';
        btnUnpin.onclick = () => this.unpinAvatar();
        grid.appendChild(btnUnpin);

        this.app.state.history.forEach(msg => {
            if (msg.role === 'gallery' && msg.galleryData && msg.galleryData.images) {
                msg.galleryData.images.forEach(imgObj => {
                    foundImages = true;
                    const img = document.createElement('img');
                    img.src = imgObj.dataUrl;
                    img.className = 'avatar-grid-item';
                    if (this.app.state.pinnedAvatarId === imgObj.id) img.classList.add('pinned');
                    img.onclick = () => this.pinAvatar(imgObj.id);
                    grid.appendChild(img);
                });
            }
        });

        if (!foundImages) {
            grid.innerHTML = '<p style="color:var(--text-muted); text-align:center; grid-column:1/-1;">No images found in history.</p>';
        }
        document.getElementById('avatar-selector-modal').classList.remove('hidden');
    }
}