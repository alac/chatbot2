import { settings, DEFAULT_PAPERDOLL_PROMPT } from '../state/AppSettings.js';
import {
    createAvatar,
    normalize,
    promptGuide,
    BODY,
    SKIN,
    PATTERNS,
    COLORS,
    EXPRESSIONS,
    EYE_SHAPES,
    HAIR_OPTIONS,
    allItems,
    getItem,
} from '../paperdoll/src/index.js';

const DEFAULT_CHARACTER_SEED = {
    name: 'Character',
    body: { height: 'average', build: 'average', bust: 'medium', hips: 'medium', shoulders: 'medium', skin: 'fair' },
    face: { eyes: { shape: 'neutral', color: '#5a72d8' } },
    hair: { color: '#4b3238' },
    outfits: {
        default: [
            { item: 'top', colors: { main: 'white', trim: 'navy' } },
            { item: 'skirt', colors: { main: 'navy' } },
            { item: 'loafers', colors: { main: 'brown' } }
        ]
    },
    expression: 'neutral'
};

export class AvatarManager {
    constructor(app) {
        this.app = app;

        this.headerAvatar = null;
        this.panelAvatar = null;
        this.compareLeftAvatar = null;
        this.compareRightAvatar = null;
        this.settingsPreviewAvatar = null;

        this.isPanelOpen = false;
        this.panelCrop = 'bust';
        this.lastRenderedJson = '';

        this.updateAbortController = null;
        this.pendingSpec = null;
        this.draftSpec = null;

        this.applySavedSidebarWidth();
        this.bindEvents();
        setTimeout(() => this.updateAvatarDisplay(), 100);
    }

    isMobile() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    getDefaultSpec() {
        return normalize(DEFAULT_CHARACTER_SEED).spec;
    }

    getActiveSpec() {
        if (this.app.state.paperdoll_avatar) {
            return normalize(this.app.state.paperdoll_avatar).spec;
        }
        return this.getDefaultSpec();
    }

    applySavedSidebarWidth() {
        const w = Math.max(220, Math.min(600, parseInt(settings.paperdollSidebarWidth) || 320));
        document.documentElement.style.setProperty('--avatar-panel-width', `${w}px`);
    }

    bindEvents() {
        // 1. Header Avatar Button: Tap to Toggle Panel, Long-Press to Update from Story
        const container = document.getElementById('avatar-container');
        let holdTimer = null;
        let longPressFired = false;
        let startX = 0;
        let startY = 0;

        const clearHold = () => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        };

        container.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            longPressFired = false;
            startX = e.clientX;
            startY = e.clientY;
            clearHold();
            holdTimer = setTimeout(() => {
                longPressFired = true;
                holdTimer = null;
                this.openUpdateWorkflow();
            }, 500);
        });

        container.addEventListener('pointermove', (e) => {
            if (!holdTimer) return;
            if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
                clearHold();
            }
        });

        container.addEventListener('pointerup', clearHold);
        container.addEventListener('pointercancel', clearHold);
        container.addEventListener('contextmenu', (e) => e.preventDefault());

        container.addEventListener('click', (e) => {
            if (longPressFired) {
                e.preventDefault();
                e.stopPropagation();
                longPressFired = false;
                return;
            }
            this.togglePanel();
        });

        // 2. Panel Controls (Sidebar / Mobile Overlay)
        document.getElementById('btn-avatar-close').addEventListener('click', () => this.closePanel());
        document.getElementById('avatar-backdrop').addEventListener('click', () => this.closePanel());
        document.getElementById('btn-avatar-update').addEventListener('click', () => this.openUpdateWorkflow());
        document.getElementById('btn-avatar-settings').addEventListener('click', () => this.openSettingsModal());

        document.getElementById('avatar-panel-crop').addEventListener('change', (e) => {
            this.panelCrop = e.target.value;
            if (this.panelAvatar) this.panelAvatar.set({ crop: this.panelCrop });
        });

        document.getElementById('avatar-quick-expression').addEventListener('change', (e) => {
            const spec = this.getActiveSpec();
            spec.expression = e.target.value;
            this.saveSpecToState(spec);
        });

        document.getElementById('avatar-quick-outfit').addEventListener('change', (e) => {
            const spec = this.getActiveSpec();
            spec.outfit = e.target.value;
            this.saveSpecToState(spec);
        });

        // 3. Desktop Sidebar Resizer
        const resizer = document.getElementById('avatar-resizer');
        let isDragging = false;

        resizer.addEventListener('pointerdown', (e) => {
            if (this.isMobile()) return;
            isDragging = true;
            resizer.classList.add('dragging');
            resizer.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        resizer.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const maxW = Math.min(600, Math.floor(window.innerWidth * 0.55));
            const newW = Math.max(220, Math.min(maxW, Math.round(window.innerWidth - e.clientX)));
            document.documentElement.style.setProperty('--avatar-panel-width', `${newW}px`);
            settings.paperdollSidebarWidth = newW;
        });

        const stopDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            resizer.classList.remove('dragging');
            settings.save();
        };
        resizer.addEventListener('pointerup', stopDrag);
        resizer.addEventListener('pointercancel', stopDrag);

        window.addEventListener('resize', () => this.syncPanelBackdrop());

        // 4. Keep Avatar Synced with State Changes (Undo/Redo/Slot Load)
        if (this.app.events) {
            this.app.events.addEventListener('state:change', () => {
                const currentJson = JSON.stringify(this.app.state.paperdoll_avatar);
                if (currentJson !== this.lastRenderedJson) {
                    this.updateAvatarDisplay();
                }
            });
        }

        // 5. Update Diff Modal Events
        document.getElementById('btn-close-pd-update').addEventListener('click', () => this.closeUpdateModal());
        document.getElementById('btn-pd-update-discard').addEventListener('click', () => this.closeUpdateModal());
        document.getElementById('btn-pd-update-abort').addEventListener('click', () => {
            if (this.updateAbortController) this.updateAbortController.abort();
        });
        document.getElementById('btn-pd-update-retry').addEventListener('click', () => this.runUpdateLLM());
        document.getElementById('btn-pd-update-accept-all').addEventListener('click', () => {
            if (this.pendingSpec) {
                this.saveSpecToState(this.pendingSpec);
            }
            this.closeUpdateModal();
        });
        document.getElementById('btn-pd-update-accept-clothing').addEventListener('click', () => {
            if (this.pendingSpec) {
                const current = this.getActiveSpec();
                const merged = {
                    ...this.pendingSpec,
                    name: current.name || this.pendingSpec.name,
                    body: structuredClone(current.body),
                    face: structuredClone(current.face),
                    hair: structuredClone(current.hair),
                    outfits: {
                        ...(structuredClone(current.outfits) || {}),
                        ...(structuredClone(this.pendingSpec.outfits) || {})
                    },
                    outfit: this.pendingSpec.outfit,
                    expression: this.pendingSpec.expression
                };
                this.saveSpecToState(merged);
            }
            this.closeUpdateModal();
        });
        document.getElementById('pd-update-crop').addEventListener('change', (e) => {
            const crop = e.target.value;
            if (this.compareLeftAvatar) this.compareLeftAvatar.set({ crop });
            if (this.compareRightAvatar) this.compareRightAvatar.set({ crop });
        });

        // 6. Paperdoll Settings Modal Events
        document.getElementById('btn-close-pd-settings').addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('btn-pd-settings-cancel').addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('btn-pd-settings-save').addEventListener('click', () => this.saveSettingsModal());
        document.getElementById('btn-pd-settings-reset').addEventListener('click', () => {
            if (confirm('Reset this slot\'s avatar back to defaults?')) {
                this.draftSpec = this.getDefaultSpec();
                this.renderSettingsForm();
                this.refreshSettingsPreview();
            }
        });
        document.getElementById('pd-set-preview-crop').addEventListener('change', (e) => {
            if (this.settingsPreviewAvatar) this.settingsPreviewAvatar.set({ crop: e.target.value });
        });

        // 7. Prompt Editor Modal Events
        document.getElementById('btn-pd-edit-prompt').addEventListener('click', () => this.openPromptModal());
        document.getElementById('btn-close-pd-prompt').addEventListener('click', () => this.closePromptModal());
        document.getElementById('btn-pd-prompt-cancel').addEventListener('click', () => this.closePromptModal());
        document.getElementById('btn-pd-prompt-default').addEventListener('click', () => {
            document.getElementById('pd-prompt-textarea').value = DEFAULT_PAPERDOLL_PROMPT;
            document.getElementById('pd-prompt-turns').value = 4;
        });
        document.getElementById('btn-pd-prompt-save').addEventListener('click', () => {
            settings.paperdollUpdatePrompt = document.getElementById('pd-prompt-textarea').value;
            settings.paperdollContextTurns = Math.max(1, parseInt(document.getElementById('pd-prompt-turns').value) || 4);
            settings.save();
            this.closePromptModal();
        });

        document.querySelectorAll('.pd-placeholder-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = document.getElementById('pd-prompt-textarea');
                const token = btn.dataset.token;
                const start = ta.selectionStart ?? ta.value.length;
                const end = ta.selectionEnd ?? ta.value.length;
                ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
                ta.focus();
                ta.setSelectionRange(start + token.length, start + token.length);
            });
        });

        // 8. ImageGen Lightbox Compatibility
        document.getElementById('btn-close-lightbox').addEventListener('click', () => {
            document.getElementById('lightbox-modal').classList.add('hidden');
        });
    }

    // --- Core State & Rendering ---

    saveSpecToState(spec) {
        this.app.state.paperdoll_avatar = normalize(spec).spec;
        this.app.state.emitChange();
        this.updateAvatarDisplay();
    }

    updateAvatarDisplay() {
        const spec = this.getActiveSpec();
        this.lastRenderedJson = JSON.stringify(this.app.state.paperdoll_avatar);
        const finish = parseInt(settings.paperdollFinish ?? 1);

        // Update Header Portrait
        const headerStage = document.getElementById('avatar-header-stage');
        if (headerStage) {
            if (!this.headerAvatar) {
                headerStage.innerHTML = '';
                this.headerAvatar = createAvatar(headerStage, spec, {
                    crop: 'face',
                    breathing: false,
                    blinking: false,
                    finish
                });
            } else {
                this.headerAvatar.update(spec);
                this.headerAvatar.set({ finish, crop: 'face', breathing: false, blinking: false });
            }
        }

        // Update Panel Avatar if open
        if (this.isPanelOpen) {
            this.renderPanelAvatar(spec);
        }
    }

    renderPanelAvatar(spec = this.getActiveSpec()) {
        const stage = document.getElementById('avatar-panel-stage');
        const finish = parseInt(settings.paperdollFinish ?? 1);

        if (!this.panelAvatar) {
            stage.innerHTML = '';
            this.panelAvatar = createAvatar(stage, spec, {
                crop: this.panelCrop,
                breathing: true,
                blinking: true,
                finish
            });
        } else {
            this.panelAvatar.update(spec);
            this.panelAvatar.set({ crop: this.panelCrop, finish, breathing: true, blinking: true });
        }

        document.getElementById('avatar-panel-title').textContent = spec.name ? spec.name : 'Avatar';

        // Populate Quick Expression Dropdown
        const exprSel = document.getElementById('avatar-quick-expression');
        exprSel.innerHTML = '';
        Object.keys(EXPRESSIONS).forEach(expr => {
            const opt = document.createElement('option');
            opt.value = expr;
            opt.textContent = this.formatLabel(expr);
            if (spec.expression === expr) opt.selected = true;
            exprSel.appendChild(opt);
        });

        // Populate Quick Outfit Dropdown
        const outfitSel = document.getElementById('avatar-quick-outfit');
        outfitSel.innerHTML = '';
        Object.keys(spec.outfits || { default: [] }).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = this.formatLabel(name);
            if (spec.outfit === name) opt.selected = true;
            outfitSel.appendChild(opt);
        });
    }

    togglePanel() {
        if (this.isPanelOpen) this.closePanel();
        else this.openPanel();
    }

    openPanel() {
        this.isPanelOpen = true;
        document.getElementById('avatar-panel').classList.remove('hidden');
        this.syncPanelBackdrop();
        this.renderPanelAvatar();
    }

    closePanel() {
        this.isPanelOpen = false;
        document.getElementById('avatar-panel').classList.add('hidden');
        document.getElementById('avatar-resizer').classList.add('hidden');
        document.getElementById('avatar-backdrop').classList.add('hidden');
        document.body.classList.remove('avatar-sidebar-open');
        if (this.panelAvatar) {
            this.panelAvatar.set({ breathing: false, blinking: false });
        }
    }

    syncPanelBackdrop() {
        const resizer = document.getElementById('avatar-resizer');
        const backdrop = document.getElementById('avatar-backdrop');
        if (!this.isPanelOpen) {
            resizer.classList.add('hidden');
            backdrop.classList.add('hidden');
            document.body.classList.remove('avatar-sidebar-open');
            return;
        }
        if (this.isMobile()) {
            resizer.classList.add('hidden');
            backdrop.classList.remove('hidden');
            document.body.classList.remove('avatar-sidebar-open');
        } else {
            resizer.classList.remove('hidden');
            backdrop.classList.add('hidden');
            document.body.classList.add('avatar-sidebar-open');
        }
    }

    // --- Long-Press LLM Update Workflow ---

    collectRecentMessages(limit) {
        const collected = [];
        for (let i = this.app.state.history.length - 1; i >= 0 && collected.length < limit; i--) {
            const turn = this.app.state.history[i];
            if (!turn || turn.isHidden) continue;
            if (turn.role !== 'user' && turn.role !== 'assistant') continue;

            let text = this.app.state.getContent(i) || '';
            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (!text) continue;

            const speaker = turn.role === 'user' ? 'User' : 'Assistant';
            collected.unshift(`${speaker}: ${text}`);
        }
        return collected.join('\n\n');
    }

    openUpdateWorkflow() {
        const turnCount = Math.max(1, parseInt(settings.paperdollContextTurns) || 4);
        const contextText = this.collectRecentMessages(turnCount);
        if (!contextText) {
            alert('No story messages available to update the avatar from.');
            return;
        }

        this.pendingSpec = null;
        const currentSpec = this.getActiveSpec();
        const crop = document.getElementById('pd-update-crop').value || 'full';
        const finish = parseInt(settings.paperdollFinish ?? 1);

        // Render Left (Existing)
        const leftStage = document.getElementById('pd-compare-left');
        if (this.compareLeftAvatar) {
            this.compareLeftAvatar.destroy();
            this.compareLeftAvatar = null;
        }
        leftStage.innerHTML = '';
        this.compareLeftAvatar = createAvatar(leftStage, currentSpec, {
            crop,
            breathing: false,
            blinking: false,
            finish
        });

        document.getElementById('paperdoll-update-modal').classList.remove('hidden');
        this.runUpdateLLM();
    }

    async runUpdateLLM() {
        if (this.updateAbortController) this.updateAbortController.abort();
        this.updateAbortController = new AbortController();

        const turnCount = Math.max(1, parseInt(settings.paperdollContextTurns) || 4);
        const contextText = this.collectRecentMessages(turnCount);
        const currentSpec = this.getActiveSpec();
        const tpl = settings.paperdollUpdatePrompt || DEFAULT_PAPERDOLL_PROMPT;

        const promptText = tpl
            .replaceAll('{{promptGuide}}', promptGuide())
            .replaceAll('{{context}}', contextText)
            .replaceAll('{{currentSpec}}', JSON.stringify(currentSpec))
            .trim();

        const rightStage = document.getElementById('pd-compare-right');
        const statusEl = document.getElementById('pd-update-status');
        const warningsEl = document.getElementById('pd-update-warnings');
        const rawDetails = document.getElementById('pd-update-raw-details');
        const rawTextEl = document.getElementById('pd-update-raw-text');
        const btnAcceptAll = document.getElementById('btn-pd-update-accept-all');
        const btnAcceptClothing = document.getElementById('btn-pd-update-accept-clothing');
        const btnRetry = document.getElementById('btn-pd-update-retry');
        const btnAbort = document.getElementById('btn-pd-update-abort');

        if (this.compareRightAvatar) {
            this.compareRightAvatar.destroy();
            this.compareRightAvatar = null;
        }

        const streamPre = document.createElement('pre');
        streamPre.className = 'pd-stream-box';
        streamPre.textContent = `Connecting to ${settings.model || 'LLM'}...\n`;
        rightStage.innerHTML = '';
        rightStage.appendChild(streamPre);

        statusEl.textContent = `Sending last ${turnCount} messages to LLM...`;
        warningsEl.classList.add('hidden');
        warningsEl.innerHTML = '';
        rawDetails.classList.add('hidden');
        rawDetails.open = false;
        rawTextEl.textContent = '';

        btnAcceptAll.disabled = true;
        btnAcceptClothing.disabled = true;
        btnRetry.classList.add('hidden');
        btnAbort.classList.remove('hidden');
        this.pendingSpec = null;

        const startTime = Date.now();
        let liveCharCount = 0;
        const tickInterval = setInterval(() => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            statusEl.textContent = `Streaming from ${settings.model || 'LLM'} (${elapsed}s • ${liveCharCount} chars)...`;
        }, 250);

        const formatCombinedStream = (reasoning, content) => {
            if (reasoning && content) return `[Thinking]\n${reasoning}\n\n[Output]\n${content}`;
            if (reasoning) return `[Thinking]\n${reasoning}`;
            return content;
        };

        try {
            const { reasoning, content } = await this.callLLMStream(
                promptText,
                this.updateAbortController.signal,
                (r, c) => {
                    const combined = formatCombinedStream(r, c);
                    liveCharCount = combined.length;
                    streamPre.textContent = combined;
                    streamPre.scrollTop = streamPre.scrollHeight;
                }
            );

            const fullRaw = formatCombinedStream(reasoning, content);
            if (fullRaw) {
                rawTextEl.textContent = fullRaw;
                rawDetails.classList.remove('hidden');
            }

            const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace <= firstBrace) {
                throw new Error('Model response did not contain a valid JSON object.');
            }

            const rawObj = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
            const { spec, warnings } = normalize(rawObj);
            this.pendingSpec = spec;

            const crop = document.getElementById('pd-update-crop').value || 'full';
            const finish = parseInt(settings.paperdollFinish ?? 1);
            rightStage.innerHTML = '';
            this.compareRightAvatar = createAvatar(rightStage, spec, {
                crop,
                breathing: true,
                blinking: true,
                finish
            });

            statusEl.textContent = spec.summary || 'Ready to review proposed avatar.';
            if (warnings && warnings.length > 0) {
                warningsEl.innerHTML = `<strong>Normalization notes (${warnings.length}):</strong><br>` +
                    warnings.map(w => this.escapeHtml(w)).join('<br>');
                warningsEl.classList.remove('hidden');
            }

            btnAcceptAll.disabled = false;
            btnAcceptClothing.disabled = false;
            btnRetry.classList.remove('hidden');
        } catch (err) {
            if (err.name === 'AbortError') {
                statusEl.textContent = 'Generation stopped.';
            } else {
                rightStage.innerHTML = `<span style="color:var(--danger); text-align:center; font-size:0.9em; padding:8px;">${this.escapeHtml(err.message)}</span>`;
                statusEl.textContent = 'Failed to parse updated avatar.';
            }
            btnRetry.classList.remove('hidden');
        } finally {
            clearInterval(tickInterval);
            btnAbort.classList.add('hidden');
            this.updateAbortController = null;
        }
    }

    async callLLMStream(promptText, signal, onProgress) {
        const baseUrl = (settings.apiUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`;

        const useChat = settings.useChatCompletions !== false;
        const endpoint = useChat ? `${baseUrl}/chat/completions` : `${baseUrl}/completions`;
        const maxTok = Math.max(parseInt(settings.maxTokens) || 1024, 1200);
        const temp = Math.min(parseFloat(settings.temperature) || 0.7, 1.0);

        const body = useChat
            ? { model: settings.model, messages: [{ role: 'user', content: promptText }], temperature: temp, max_tokens: maxTok, stream: true }
            : { model: settings.model, prompt: promptText, temperature: temp, max_tokens: maxTok, stream: true };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal
        });

        if (!res.ok) {
            const errTxt = await res.text().catch(() => res.statusText);
            throw new Error(`HTTP ${res.status}: ${errTxt}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json') || !res.body) {
            const data = await res.json();
            const msg = data.choices?.[0]?.message;
            const reasoning = msg?.reasoning_content || msg?.reasoning || '';
            const content = useChat ? (msg?.content || '') : (data.choices?.[0]?.text || '');
            if (onProgress) onProgress(reasoning, content);
            return { reasoning, content };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let reasoning = '';
        let content = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || !line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') continue;

                try {
                    const chunk = JSON.parse(payload);
                    const choice = chunk.choices?.[0];
                    if (!choice) continue;

                    if (useChat) {
                        const delta = choice.delta || {};
                        if (delta.reasoning_content) reasoning += delta.reasoning_content;
                        else if (delta.reasoning) reasoning += delta.reasoning;
                        if (delta.content) content += delta.content;
                    } else if (choice.text) {
                        content += choice.text;
                    }

                    if (onProgress) onProgress(reasoning, content);
                } catch {
                    // Ignore incomplete/malformed SSE chunk
                }
            }
        }

        return { reasoning, content };
    }

    closeUpdateModal() {
        if (this.updateAbortController) {
            this.updateAbortController.abort();
            this.updateAbortController = null;
        }
        if (this.compareLeftAvatar) {
            this.compareLeftAvatar.destroy();
            this.compareLeftAvatar = null;
        }
        if (this.compareRightAvatar) {
            this.compareRightAvatar.destroy();
            this.compareRightAvatar = null;
        }
        this.pendingSpec = null;
        document.getElementById('paperdoll-update-modal').classList.add('hidden');
    }

    // --- Paperdoll Settings & Customization Modal ---

    openSettingsModal() {
        this.draftSpec = structuredClone(this.getActiveSpec());
        this.renderSettingsForm();
        this.refreshSettingsPreview();
        document.getElementById('paperdoll-settings-modal').classList.remove('hidden');
    }

    closeSettingsModal() {
        if (this.settingsPreviewAvatar) {
            this.settingsPreviewAvatar.destroy();
            this.settingsPreviewAvatar = null;
        }
        this.draftSpec = null;
        document.getElementById('paperdoll-settings-modal').classList.add('hidden');
    }

    saveSettingsModal() {
        if (!this.draftSpec) return;
        settings.save();
        this.saveSpecToState(this.draftSpec);
        this.closeSettingsModal();
    }

    refreshSettingsPreview() {
        if (!this.draftSpec) return;
        const stage = document.getElementById('pd-settings-preview-stage');
        const crop = document.getElementById('pd-set-preview-crop').value || 'full';
        const finish = parseInt(settings.paperdollFinish ?? 1);

        if (!this.settingsPreviewAvatar) {
            stage.innerHTML = '';
            this.settingsPreviewAvatar = createAvatar(stage, this.draftSpec, {
                crop,
                breathing: true,
                blinking: true,
                finish
            });
        } else {
            this.settingsPreviewAvatar.update(this.draftSpec);
            this.settingsPreviewAvatar.set({ crop, finish });
        }
    }

    renderSettingsForm() {
        const container = document.getElementById('pd-settings-controls');
        container.innerHTML = '';
        const spec = this.draftSpec;

        // 1. General & Defaults
        const secGen = this.createSection('General & Defaults');
        secGen.appendChild(this.createTextRow('Name', spec.name || '', (val) => {
            spec.name = val;
        }));
        secGen.appendChild(this.createSelectRow('Expression', Object.keys(EXPRESSIONS), spec.expression, (val) => {
            spec.expression = val;
            this.refreshSettingsPreview();
        }));
        secGen.appendChild(this.createSelectRow('Render Finish', [
            { value: '0', label: 'Flat Cel' },
            { value: '1', label: 'Shaded (Default)' },
            { value: '2', label: 'Shaded + Glow' }
        ], String(settings.paperdollFinish ?? 1), (val) => {
            settings.paperdollFinish = parseInt(val);
            this.refreshSettingsPreview();
        }));
        container.appendChild(secGen);

        // 2. Body Proportions (Sliders + Bucket Presets)
        const secBody = this.createSection('Body & Skin');
        for (const key in BODY) {
            const { range, buckets } = BODY[key];
            const val = typeof spec.body[key] === 'number' ? spec.body[key] : 0;

            const row = document.createElement('div');
            row.className = 'pd-slider-row';

            const lbl = document.createElement('span');
            lbl.className = 'label-text';
            lbl.textContent = this.formatLabel(key);

            const sel = document.createElement('select');
            const customOpt = document.createElement('option');
            customOpt.value = '__custom__';
            customOpt.textContent = 'Custom';
            sel.appendChild(customOpt);

            for (const bName in buckets) {
                const opt = document.createElement('option');
                opt.value = bName;
                opt.textContent = this.formatLabel(bName);
                if (Math.abs(buckets[bName] - val) < 0.02) opt.selected = true;
                sel.appendChild(opt);
            }

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = range[0];
            slider.max = range[1];
            slider.step = '0.05';
            slider.value = val;

            const readout = document.createElement('span');
            readout.className = 'pd-slider-val';
            readout.textContent = val.toFixed(2);

            sel.addEventListener('change', () => {
                if (sel.value === '__custom__') return;
                const next = buckets[sel.value];
                slider.value = next;
                readout.textContent = next.toFixed(2);
                spec.body[key] = next;
                this.refreshSettingsPreview();
            });

            slider.addEventListener('input', () => {
                const next = parseFloat(slider.value);
                readout.textContent = next.toFixed(2);
                spec.body[key] = next;
                const matchedBucket = Object.keys(buckets).find(b => Math.abs(buckets[b] - next) < 0.02);
                sel.value = matchedBucket || '__custom__';
                this.refreshSettingsPreview();
            });

            row.append(lbl, sel, slider, readout);
            secBody.appendChild(row);
        }

        secBody.appendChild(this.createColorRow('Skin Tone', SKIN, spec.body.skin, (hex) => {
            spec.body.skin = hex;
            this.refreshSettingsPreview();
        }));
        container.appendChild(secBody);

        // 3. Face & Eyes
        const secFace = this.createSection('Face & Eyes');
        secFace.appendChild(this.createSelectRow('Eye Shape', Object.keys(EYE_SHAPES), spec.face.eyes.shape, (val) => {
            spec.face.eyes.shape = val;
            this.refreshSettingsPreview();
        }));
        secFace.appendChild(this.createColorRow('Eye Color', COLORS, spec.face.eyes.color, (hex) => {
            spec.face.eyes.color = hex;
            this.refreshSettingsPreview();
        }));
        container.appendChild(secFace);

        // 4. Hair
        const secHair = this.createSection('Hair');
        secHair.appendChild(this.createColorRow('Hair Color', COLORS, spec.hair.color, (hex) => {
            spec.hair.color = hex;
            this.refreshSettingsPreview();
        }));
        for (const hKey in HAIR_OPTIONS) {
            secHair.appendChild(this.createSelectRow(this.formatLabel(hKey), HAIR_OPTIONS[hKey], spec.hair[hKey], (val) => {
                spec.hair[hKey] = val;
                this.refreshSettingsPreview();
            }));
        }
        container.appendChild(secHair);

        // 5. Outfits & Garments
        const secOutfit = this.createSection('Outfits');
        const outfitNames = Object.keys(spec.outfits || { default: [] });
        const outfitHeader = document.createElement('div');
        outfitHeader.className = 'setting-row';

        const outfitSelect = document.createElement('select');
        outfitSelect.style.flex = '1';
        outfitNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = this.formatLabel(name);
            if (name === spec.outfit) opt.selected = true;
            outfitSelect.appendChild(opt);
        });
        outfitSelect.addEventListener('change', () => {
            spec.outfit = outfitSelect.value;
            this.renderSettingsForm();
            this.refreshSettingsPreview();
        });

        const btnNewOutfit = document.createElement('button');
        btnNewOutfit.className = 'secondary';
        btnNewOutfit.textContent = '+ Outfit';
        btnNewOutfit.addEventListener('click', () => {
            const rawName = prompt('New outfit name (e.g. casual, swim, pajamas):');
            if (!rawName || !rawName.trim()) return;
            const clean = rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
            if (!spec.outfits[clean]) {
                spec.outfits[clean] = structuredClone(spec.outfits[spec.outfit] || []);
            }
            spec.outfit = clean;
            this.renderSettingsForm();
            this.refreshSettingsPreview();
        });

        const btnDelOutfit = document.createElement('button');
        btnDelOutfit.className = 'danger';
        btnDelOutfit.textContent = '🗑️';
        btnDelOutfit.title = 'Delete this outfit';
        btnDelOutfit.disabled = outfitNames.length <= 1;
        btnDelOutfit.addEventListener('click', () => {
            if (outfitNames.length <= 1) return;
            delete spec.outfits[spec.outfit];
            spec.outfit = Object.keys(spec.outfits)[0];
            this.renderSettingsForm();
            this.refreshSettingsPreview();
        });

        outfitHeader.append(outfitSelect, btnNewOutfit, btnDelOutfit);
        secOutfit.appendChild(outfitHeader);

        const activeItems = spec.outfits[spec.outfit] || [];
        const visibleCatalog = allItems().filter(d => !d.hidden);

        activeItems.forEach((itemObj, idx) => {
            const def = getItem(itemObj.item);
            if (!def) return;

            const card = document.createElement('div');
            card.className = 'pd-outfit-card';

            // Garment Selector + Remove
            const topRow = document.createElement('div');
            topRow.className = 'setting-row';
            const itemSel = document.createElement('select');
            itemSel.style.flex = '1';
            visibleCatalog.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = `${d.label} (${d.slot})`;
                if (d.id === def.id) opt.selected = true;
                itemSel.appendChild(opt);
            });
            itemSel.addEventListener('change', () => {
                const nextDef = getItem(itemSel.value);
                activeItems[idx] = {
                    item: nextDef.id,
                    colors: { ...nextDef.channels }
                };
                for (const k in nextDef.defaults) {
                    activeItems[idx][k] = nextDef.defaults[k];
                }
                this.renderSettingsForm();
                this.refreshSettingsPreview();
            });

            const btnRm = document.createElement('button');
            btnRm.className = 'danger';
            btnRm.style.padding = '4px 8px';
            btnRm.textContent = '×';
            btnRm.title = 'Remove item';
            btnRm.addEventListener('click', () => {
                activeItems.splice(idx, 1);
                this.renderSettingsForm();
                this.refreshSettingsPreview();
            });
            topRow.append(itemSel, btnRm);
            card.appendChild(topRow);

            // Item Options
            for (const optKey in def.options) {
                const curVal = itemObj[optKey] !== undefined ? itemObj[optKey] : def.defaults[optKey];
                card.appendChild(this.createSelectRow(this.formatLabel(optKey), def.options[optKey], curVal, (val) => {
                    itemObj[optKey] = val;
                    this.refreshSettingsPreview();
                }));
            }

            // Item Flags
            for (const flagKey in def.flags) {
                const row = document.createElement('div');
                row.className = 'setting-row';
                const lbl = document.createElement('span');
                lbl.className = 'label-text';
                lbl.textContent = this.formatLabel(flagKey);
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.checked = !!(itemObj[flagKey] !== undefined ? itemObj[flagKey] : def.defaults[flagKey]);
                chk.addEventListener('change', () => {
                    itemObj[flagKey] = chk.checked;
                    this.refreshSettingsPreview();
                });
                row.append(lbl, chk);
                card.appendChild(row);
            }

            // Channel Colors
            itemObj.colors = itemObj.colors || { ...def.channels };
            for (const ch in def.channels) {
                const curHex = itemObj.colors[ch] || def.channels[ch];
                card.appendChild(this.createColorRow(`Color: ${this.formatLabel(ch)}`, COLORS, curHex, (hex) => {
                    itemObj.colors[ch] = hex;
                    this.refreshSettingsPreview();
                }));
            }

            // Pattern
            const curPat = itemObj.pattern?.type || 'solid';
            card.appendChild(this.createSelectRow('Pattern', PATTERNS, curPat, (val) => {
                if (val === 'solid') {
                    delete itemObj.pattern;
                } else {
                    itemObj.pattern = { type: val, color: itemObj.pattern?.color || '#ffffff' };
                }
                this.renderSettingsForm();
                this.refreshSettingsPreview();
            }));

            if (curPat !== 'solid') {
                card.appendChild(this.createColorRow('Pattern Color', COLORS, itemObj.pattern.color || '#ffffff', (hex) => {
                    itemObj.pattern.color = hex;
                    this.refreshSettingsPreview();
                }));
            }

            secOutfit.appendChild(card);
        });

        const btnAddGarment = document.createElement('button');
        btnAddGarment.className = 'secondary';
        btnAddGarment.textContent = '+ Add Garment';
        btnAddGarment.addEventListener('click', () => {
            const usedIds = new Set(activeItems.map(x => x.item));
            const nextDef = visibleCatalog.find(d => !usedIds.has(d.id)) || visibleCatalog[0];
            if (!nextDef) return;
            const entry = { item: nextDef.id, colors: { ...nextDef.channels } };
            for (const k in nextDef.defaults) entry[k] = nextDef.defaults[k];
            activeItems.push(entry);
            this.renderSettingsForm();
            this.refreshSettingsPreview();
        });
        secOutfit.appendChild(btnAddGarment);

        container.appendChild(secOutfit);
    }

    // --- UI Row Builders ---

    createSection(title) {
        const sec = document.createElement('div');
        sec.className = 'pd-section';
        const hdr = document.createElement('div');
        hdr.className = 'pd-section-title';
        hdr.textContent = title;
        sec.appendChild(hdr);
        return sec;
    }

    createTextRow(label, value, onInput) {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const lbl = document.createElement('span');
        lbl.className = 'label-text';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = value;
        inp.style.flex = '1';
        inp.style.maxWidth = '220px';
        inp.addEventListener('input', () => onInput(inp.value));
        row.append(lbl, inp);
        return row;
    }

    createSelectRow(label, options, currentVal, onChange) {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const lbl = document.createElement('span');
        lbl.className = 'label-text';
        lbl.textContent = label;
        const sel = document.createElement('select');
        sel.style.flex = '1';
        sel.style.maxWidth = '220px';

        options.forEach(o => {
            const val = typeof o === 'string' ? o : o.value;
            const text = typeof o === 'string' ? this.formatLabel(o) : o.label;
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = text;
            if (val === currentVal) opt.selected = true;
            sel.appendChild(opt);
        });

        sel.addEventListener('change', () => onChange(sel.value));
        row.append(lbl, sel);
        return row;
    }

    createColorRow(label, paletteMap, currentHex, onChange) {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const lbl = document.createElement('span');
        lbl.className = 'label-text';
        lbl.textContent = label;

        const pair = document.createElement('div');
        pair.className = 'pd-color-pair';

        const sel = document.createElement('select');
        sel.style.width = '130px';
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Custom';
        sel.appendChild(customOpt);

        const normHex = (currentHex || '#ffffff').toLowerCase();
        Object.keys(paletteMap).sort().forEach(name => {
            const hex = paletteMap[name].toLowerCase();
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = this.formatLabel(name);
            if (hex === normHex) opt.selected = true;
            sel.appendChild(opt);
        });

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = /^#[0-9a-f]{6}$/i.test(normHex) ? normHex : '#ffffff';

        sel.addEventListener('change', () => {
            if (sel.value === '__custom__') return;
            const hex = paletteMap[sel.value].toLowerCase();
            picker.value = hex;
            onChange(hex);
        });

        picker.addEventListener('input', () => {
            const hex = picker.value.toLowerCase();
            const matched = Object.keys(paletteMap).find(k => paletteMap[k].toLowerCase() === hex);
            sel.value = matched || '__custom__';
            onChange(hex);
        });

        pair.append(sel, picker);
        row.append(lbl, pair);
        return row;
    }

    formatLabel(str) {
        return String(str)
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // --- Prompt Editor Modal ---

    openPromptModal() {
        document.getElementById('pd-prompt-turns').value = settings.paperdollContextTurns || 4;
        document.getElementById('pd-prompt-textarea').value = settings.paperdollUpdatePrompt || DEFAULT_PAPERDOLL_PROMPT;
        document.getElementById('paperdoll-prompt-modal').classList.remove('hidden');
    }

    closePromptModal() {
        document.getElementById('paperdoll-prompt-modal').classList.add('hidden');
    }

    // --- ImageGen Compatibility ---

    pinAvatar() {
        // Retained as no-op for backward compatibility; Paperdoll controls #avatar-container.
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
}