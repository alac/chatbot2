import { settings } from '../state/AppSettings.js';

export class RequestTracker {
    constructor(app) {
        this.app = app;
        this.activeCount = 0;
        this.hasUnreadCompletion = false;

        this.wakeLock = null;

        this.clockFrames = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
        this.clockIndex = 0;
        this.timer = null;

        this.bindEvents();
    }

    bindEvents() {
        const handleVisibilityOrFocus = async () => {
            if (document.visibilityState === 'visible') {
                // If a generation is still active when returning to the tab, re-acquire the lock
                if (this.activeCount > 0) {
                    await this.acquireWakeLock();
                }

                // Clear unread indicator if finished while in background
                if (this.hasUnreadCompletion && this.activeCount === 0) {
                    this.hasUnreadCompletion = false;
                    this.updateTitle();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);
    }

    async acquireWakeLock() {
        if ('wakeLock' in navigator && !this.wakeLock) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => {
                    this.wakeLock = null;
                });
            } catch (err) {
                // Fails silently if low-battery mode or OS policies reject the lock
                this.wakeLock = null;
            }
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            try {
                await this.wakeLock.release();
            } catch (err) {}
            this.wakeLock = null;
        }
    }

    getBaseTitle() {
        return this.app.getBaseTitle();
    }

    async startTask() {
        this.activeCount++;
        this.hasUnreadCompletion = false;

        // Keep the screen awake during active generation
        await this.acquireWakeLock();

        if (!this.timer) {
            this.clockIndex = 0;
            this.tick();
            // 1s interval matches background tab throttling
            this.timer = setInterval(() => this.tick(), 1000);
        }
    }

    async endTask() {
        this.activeCount = Math.max(0, this.activeCount - 1);

        if (this.activeCount === 0) {
            // Release the screen wake lock when finished
            await this.releaseWakeLock();

            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }

            // Crisp double-pulse vibration (100ms vibrate, 50ms pause, 100ms vibrate)
            if (settings.enableHaptics && 'vibrate' in navigator) {
                try {
                    navigator.vibrate([100, 50, 100]);
                } catch (e) {}
            }

            if (document.hidden) {
                this.hasUnreadCompletion = true;
                document.title = `✨ ${this.getBaseTitle()}`;
            } else {
                this.updateTitle();
            }
        }
    }

    tick() {
        const icon = this.clockFrames[this.clockIndex];
        this.clockIndex = (this.clockIndex + 1) % this.clockFrames.length;
        document.title = `${icon} ${this.getBaseTitle()}`;
    }

    updateTitle() {
        if (this.activeCount > 0) {
            return;
        }

        if (this.hasUnreadCompletion) {
            document.title = `✨ ${this.getBaseTitle()}`;
        } else {
            document.title = this.getBaseTitle();
        }
    }
}
