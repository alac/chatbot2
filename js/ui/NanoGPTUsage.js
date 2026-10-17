import { settings } from '../state/AppSettings.js';

export class NanoGPTUsage {
    constructor() {
        this.container = document.getElementById('nanogpt-meter');
        this.fill = document.getElementById('nanogpt-meter-fill');
        this.lastFetchTime = 0;
        this.isFetching = false;
        this.bindEvents();
    }

    bindEvents() {
        if (!this.container) return;
        this.container.addEventListener('click', () => {
            this.update(true);
        });
    }

    isNanoGPT() {
        const url = (settings.apiUrl || '').toLowerCase();
        return (url.includes('nanogpt') || url.includes('nano-gpt')) && Boolean(settings.apiKey);
    }

    async update(force = false) {
        if (!this.container || !this.fill) return;

        if (!this.isNanoGPT()) {
            this.container.classList.add('hidden');
            return;
        }

        // Prevent hammering the endpoint within a 4-second debounce window
        const now = Date.now();
        if (!force && now - this.lastFetchTime < 4000) return;
        if (this.isFetching) return;

        // 1. Force the official API Gateway which has CORS enabled
        let origin = 'https://api.nano-gpt.com';
        let endpointPath = '/api/subscription/v1/usage';

        if (settings.apiUrl) {
            try {
                const parsed = new URL(settings.apiUrl);
                // 2. If you are using a 3rd party proxy (not nano-gpt), respect the proxy
                if (!parsed.hostname.includes('nano-gpt.com') && !parsed.hostname.includes('nanogpt')) {
                    origin = parsed.origin;
                    endpointPath = parsed.pathname.replace(/\/v1\/?$/, '/subscription/usage');
                }
            } catch (e) {}
        }

        const endpoint = `${origin}${endpointPath}`;

        this.isFetching = true;
        this.lastFetchTime = now;

        try {
            // 3. ONLY send Authorization. Other headers (x-api-key) trigger CORS preflight rejection.
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${settings.apiKey}`
                }
            });

            if (!response.ok) {
                this.container.classList.add('hidden');
                return;
            }

            const data = await response.json();
            if (!data || data.active === false || data.state !== 'active') {
                this.container.classList.add('hidden');
                return;
            }

            const weekly = data.weeklyInputTokens;
            if (!weekly) {
                this.container.classList.add('hidden');
                return;
            }

            const percent = typeof weekly.percentUsed === 'number' 
                ? weekly.percentUsed 
                : (weekly.used / (weekly.used + (weekly.remaining || 0)));

            const clampedHeight = Math.min(100, Math.max(0, percent * 100));
            this.fill.style.height = `${clampedHeight}%`;

            const usedStr = this.formatTokens(weekly.used || 0);
            const totalStr = this.formatTokens((weekly.used || 0) + (weekly.remaining || 0));
            const pctStr = (percent * 100).toFixed(1);
            const resetStr = weekly.resetAt ? ` • Resets in ${this.formatTimeRemaining(weekly.resetAt)}` : '';

            this.container.title = `NanoGPT Weekly Usage: ${usedStr} / ${totalStr} (${pctStr}%)${resetStr}\nClick to refresh`;
            this.container.classList.remove('hidden');
        } catch (err) {
            this.container.classList.add('hidden');
        } finally {
            this.isFetching = false;
        }
    }

    formatTokens(num) {
        if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(0) + 'k';
        return num.toString();
    }

    formatTimeRemaining(resetAt) {
        const diff = resetAt - Date.now();
        if (diff <= 0) return 'soon';
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
}