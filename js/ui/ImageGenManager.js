import { settings } from '../state/AppSettings.js';
import { ImageClient } from '../api/ImageClient.js';
import { ImageOptimizer } from '../utils/ImageOptimizer.js';

export class ImageGenManager {
    constructor(app) {
        this.app = app;
        this.abortControllers = new Map();
        this.timers = new Map();
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-image-settings-toggle').addEventListener('click', () => {
            document.getElementById('image-settings-modal').classList.remove('hidden');
            this.populateSettingsModal();
        });
        document.getElementById('btn-close-image-settings').addEventListener('click', () => {
            this.saveSettingsModal();
        });
        
        document.getElementById('btn-image-prompts-toggle').addEventListener('click', () => {
            document.getElementById('image-prompts-textarea').value = settings.imgPrompts;
            document.getElementById('image-prompts-modal').classList.remove('hidden');
        });
        document.getElementById('btn-close-image-prompts').addEventListener('click', () => {
            document.getElementById('image-prompts-modal').classList.add('hidden');
        });
        document.getElementById('btn-save-image-prompts').addEventListener('click', () => {
            settings.imgPrompts = document.getElementById('image-prompts-textarea').value;
            settings.save();
            document.getElementById('image-prompts-modal').classList.add('hidden');
            this.populatePresetsUI();
        });

        document.getElementById('tools-page-selector').addEventListener('change', (e) => {
            if (e.target.value === 'tab-tool-image') {
                this.populatePresetsUI();
            }
        });

        document.getElementById('set-img-parallel-count').addEventListener('change', () => this.renderModelRows());
    }

    populatePresetsUI() {
        const container = document.getElementById('image-presets-container');
        container.innerHTML = '';
        const raw = settings.imgPrompts || "";
        const parts = raw.split('::').filter(p => p.trim() !== '' && !p.toLowerCase().startsWith('variables'));
        
        if (parts.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted);">No image presets found. Edit prompts to add profiles.</span>';
            return;
        }

        parts.forEach(p => {
            const lines = p.trim().split(/\r?\n/);
            const title = lines.shift().trim();
            
            const btn = document.createElement('button');
            btn.className = 'primary bs-btn';
            btn.innerHTML = `<span>🎨</span> <span>${title}</span>`;
            btn.style.justifyContent = 'flex-start';
            btn.style.gap = '8px';
            
            btn.addEventListener('click', () => {
                document.getElementById('tools-modal').classList.add('hidden');
                this.executeGallery(title, p.trim());
            });
            container.appendChild(btn);
        });
    }

    populateSettingsModal() {
        document.getElementById('set-img-api-url').value = settings.imgApiUrl;
        document.getElementById('set-img-api-key').value = settings.imgApiKey;
        document.getElementById('set-img-model-list').value = settings.imgModelList;
        document.getElementById('set-img-parallel-count').value = settings.imgParallelCount;
        document.getElementById('set-img-max-dim').value = settings.imgMaxDimension;
        
        this.renderModelRows();
    }

    renderModelRows() {
        const container = document.getElementById('img-parallel-rows-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('set-img-parallel-count').value) || 1;
        const modelNames = settings.imgModelList.split(/\r?\n/).map(m => m.trim()).filter(m => m);

        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            const ovModel = settings.imgModelOverrides[i] || '';

            let selectHtml = `<select id="img-model-select-${i}" style="flex:1;"><option value="" ${i>0?'':'disabled'}>${i>0?'(Default Primary)':'Select Model...'}</option>`;
            modelNames.forEach(m => selectHtml += `<option value="${m}" ${m===ovModel?'selected':''}>${m}</option>`);
            selectHtml += `</select>`;

            row.innerHTML = `
                <div class="batch-row-top">Image Model ${i+1}</div>
                <div class="batch-row-bottom">
                    ${selectHtml}
                    <input type="text" id="img-model-txt-${i}" value="${ovModel}" placeholder="Custom Model ID" style="flex:1;">
                </div>
            `;
            container.appendChild(row);

            const sel = row.querySelector('select');
            const txt = row.querySelector('input');
            sel.addEventListener('change', (e) => txt.value = e.target.value);
        }
    }

    saveSettingsModal() {
        settings.imgApiUrl = document.getElementById('set-img-api-url').value.trim();
        settings.imgApiKey = document.getElementById('set-img-api-key').value.trim();
        settings.imgModelList = document.getElementById('set-img-model-list').value.trim();
        settings.imgParallelCount = parseInt(document.getElementById('set-img-parallel-count').value) || 1;
        settings.imgMaxDimension = parseInt(document.getElementById('set-img-max-dim').value) || 512;

        settings.imgModelOverrides = ['', '', '', ''];
        for (let i = 0; i < settings.imgParallelCount; i++) {
            const txt = document.getElementById(`img-model-txt-${i}`);
            if (txt) settings.imgModelOverrides[i] = txt.value.trim();
        }

        settings.save();
        document.getElementById('image-settings-modal').classList.add('hidden');
    }

    extractJson(text) {
        if (!text) return null;
        let clean = text.trim();

        // Find JSON objects { ... }
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
                return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
            } catch (e) {}
        }

        // Find JSON arrays [ ... ]
        const firstBracket = clean.indexOf('[');
        const lastBracket = clean.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            try {
                return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
            } catch (e) {}
        }

        return null;
    }

    async executeGallery(promptTitle, rawPromptTpl) {
        let sysPrompt = rawPromptTpl;

        // Parse ::variables block
        const parts = (settings.imgPrompts || "").split('::');
        const vars = {};
        const varPart = parts.find(p => p.trim().toLowerCase().startsWith('variables'));
        if (varPart) {
            varPart.trim().split(/\r?\n/).slice(1).forEach(l => {
                const idx = l.indexOf('=');
                if (idx !== -1) vars[l.substring(0, idx).trim()] = l.substring(idx + 1).trim();
            });
        }
        
        for (const [k, v] of Object.entries(vars)) {
            sysPrompt = sysPrompt.replaceAll(k, v);
        }

        // Pull the last 2 Assistant messages for context
        const contextMessages = [];
        let cCount = 0;
        for (let i = this.app.state.history.length - 1; i >= 0 && cCount < 2; i--) {
            const m = this.app.state.history[i];
            if (m.role === 'assistant') {
                let text = this.app.state.getContent(i);
                text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
                contextMessages.unshift(`Assistant: ${text}`);
                cCount++;
            }
        }
        
        let mem = this.app.state.systemPrompt;
        if (this.app.state.summary) mem += `\nSummary: ${this.app.state.summary}`;
        const contextStr = `${mem}\n\nRecent Events:\n${contextMessages.join('\n\n')}`;
        sysPrompt = sysPrompt.replaceAll('{{context}}', contextStr);

        const msgIndex = this.app.state.history.length;
        this.app.state.history.push({
            role: 'gallery',
            isHidden: false,
            galleryData: {
                promptTitle,
                sysPrompt,
                style: vars['{{style}}'] || '',
                imagePrompt: null,
                status: 'prompting',
                statusText: 'Generating image prompt (elapsed: 0s)...',
                activeImageIndex: 0,
                images: [],
                startTime: Date.now()
            },
            drafts: []
        });

        const abortController = new AbortController();
        this.abortControllers.set(msgIndex, abortController);
        this.app.renderAll();
        
        this._runGeneration(msgIndex, abortController.signal);
    }

    retryGallery(msgIndex) {
        const msg = this.app.state.history[msgIndex];
        if (!msg || msg.role !== 'gallery') return;
        
        msg.galleryData.status = msg.galleryData.imagePrompt ? 'generating' : 'prompting';
        msg.galleryData.statusText = msg.galleryData.imagePrompt ? 'Regenerating images (elapsed: 0s)...' : 'Regenerating prompt (elapsed: 0s)...';
        msg.galleryData.startTime = Date.now();
        msg.galleryData.images = [];
        msg.galleryData.activeImageIndex = 0;

        const abortController = new AbortController();
        this.abortControllers.set(msgIndex, abortController);
        this.app.renderAll();
        this._runGeneration(msgIndex, abortController.signal, !!msg.galleryData.imagePrompt);
    }

    abortGallery(msgIndex) {
        const controller = this.abortControllers.get(msgIndex);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(msgIndex);
        }
        if (this.timers.has(msgIndex)) {
            clearInterval(this.timers.get(msgIndex));
            this.timers.delete(msgIndex);
        }
        const msg = this.app.state.history[msgIndex];
        if (msg && msg.role === 'gallery') {
            msg.galleryData.status = msg.galleryData.images.length > 0 ? 'done' : 'error';
            msg.galleryData.statusText = 'Aborted by user.';
            this.app.renderAll();
        }
    }

    async _runGeneration(msgIndex, signal, skipPrompt = false) {
        const msg = this.app.state.history[msgIndex];
        const data = msg.galleryData;
        const count = settings.imgParallelCount || 1;
        const updateUI = () => { if(this.app.state.history[msgIndex] === msg) this.app.renderAll(); };

        data._completed = 0;
        data._total = count;

        // Start active 1-second ticking status line
        if (this.timers.has(msgIndex)) clearInterval(this.timers.get(msgIndex));
        this.timers.set(msgIndex, setInterval(() => {
            const elapsed = Math.round((Date.now() - data.startTime) / 1000);
            if (data.status === 'prompting') {
                data.statusText = `Generating image prompt (elapsed: ${elapsed}s)...`;
            } else if (data.status === 'generating') {
                data.statusText = `Generating images (elapsed: ${elapsed}s, ${data._completed} of ${data._total})...`;
            }
            updateUI();
        }, 1000));

        try {
            if (!skipPrompt) {
                const messages = [{ role: 'system', content: data.sysPrompt }];
                const resultText = await ImageClient.generateImagePrompt(messages);

                let extractedPrompt = "";
                const parsed = this.extractJson(resultText);

                if (parsed) {
                    if (Array.isArray(parsed)) {
                        extractedPrompt = parsed[0] || "";
                    } else if (Array.isArray(parsed.prompts)) {
                        extractedPrompt = parsed.prompts[0] || "";
                    } else if (Array.isArray(parsed.visual_prompts)) {
                        extractedPrompt = parsed.visual_prompts[0] || "";
                    } else if (typeof parsed.prompt === 'string') {
                        extractedPrompt = parsed.prompt;
                    } else if (typeof parsed.prompts === 'string') {
                        extractedPrompt = parsed.prompts;
                    }
                }

                // Fallback: If no valid JSON container found, strip markdown fencing/think tags cleanly
                if (!extractedPrompt) {
                    extractedPrompt = resultText
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/```(?:json)?/gi, '')
                        .replace(/```/g, '')
                        .trim();
                }

                data.imagePrompt = extractedPrompt + (data.style ? `\nStyle: ${data.style}` : '');
            }

            if (signal.aborted) throw new Error('Aborted');

            data.status = 'generating';
            const primaryModel = settings.imgModelOverrides[0] || settings.imgModelList.split(/\r?\n/)[0] || 'dall-e-3';
            const promises = [];

            for (let i = 0; i < count; i++) {
                const model = settings.imgModelOverrides[i] || primaryModel;
                
                const p = ImageClient.generateImage(data.imagePrompt, model, signal)
                    .then(async (url) => {
                        const optimized = await ImageOptimizer.optimize(url, settings.imgMaxDimension, settings.imgQuality);
                        data.images.push({
                            id: 'img_' + Math.random().toString(36).substr(2, 9),
                            dataUrl: optimized,
                            model: model
                        });
                        data._completed++;
                        if (this.app.avatarManager) this.app.avatarManager.updateAvatarDisplay();
                        updateUI();
                    }).catch(err => {
                        if (err.message !== 'Aborted') console.error(err);
                    });
                promises.push(p);
            }

            await Promise.allSettled(promises);
            data.status = data.images.length > 0 ? 'done' : 'error';
            data.statusText = data.images.length > 0 ? '' : 'All requests failed.';
            
        } catch (err) {
            data.status = 'error';
            data.statusText = err.message;
        } finally {
            this.abortControllers.delete(msgIndex);
            if (this.timers.has(msgIndex)) {
                clearInterval(this.timers.get(msgIndex));
                this.timers.delete(msgIndex);
            }
            updateUI();
            this.app.autoSave();
        }
    }
}