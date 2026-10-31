export class RequestTracker {
    constructor(app) {
        this.app = app;
        this.activeCount = 0;
        this.hasUnreadCompletion = false;

        this.clockFrames = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
        this.clockIndex = 0;
        this.timer = null;

        this.bindEvents();
    }

    bindEvents() {
        const clearNotification = () => {
            if (!document.hidden && this.hasUnreadCompletion && this.activeCount === 0) {
                this.hasUnreadCompletion = false;
                this.updateTitle();
            }
        };

        document.addEventListener('visibilitychange', clearNotification);
        window.addEventListener('focus', clearNotification);
    }

    getBaseTitle() {
        return this.app.getBaseTitle();
    }

    startTask() {
        this.activeCount++;
        this.hasUnreadCompletion = false;

        if (!this.timer) {
            this.clockIndex = 0;
            this.tick();
            // 1s interval matches background tab throttling perfectly
            this.timer = setInterval(() => this.tick(), 1000);
        }
    }

    endTask() {
        this.activeCount = Math.max(0, this.activeCount - 1);

        if (this.activeCount === 0) {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
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
            // Let the active tick handle it
            return;
        }

        if (this.hasUnreadCompletion) {
            document.title = `✨ ${this.getBaseTitle()}`;
        } else {
            document.title = this.getBaseTitle();
        }
    }
}
