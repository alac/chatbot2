import { settings } from '../state/AppSettings.js'; 
import { OpenAIClient } from '../api/OpenAIClient.js';

export class SettingsMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.globalModal = document.getElementById('settings-modal');
        this.chatModal = document.getElementById('chat-settings-modal');
        this.choicesModal = document.getElementById('choices-settings-modal');
        this.bindEvents();
        this.populateUI();
    }

    bindEvents() {
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.globalModal.classList.remove('hidden');
            if (this.uiManager.slotManager) this.uiManager.slotManager.refreshSlotList(); 
        });
        document.getElementById('btn-close-settings').addEventListener('click', () => this.closeAndSave());
        
        document.getElementById('btn-chat-settings').addEventListener('click', () => {
            this.populateUI(); 
            this.uiManager.notesManager.renderBoard();
            this.chatModal.classList.remove('hidden');
        });
        document.getElementById('btn-close-chat-settings').addEventListener('click', () => {
            this.closeAndSaveChatSettings();
        });

        // Tab Selectors
        document.getElementById('settings-page-selector').addEventListener('change', (e) => {
            this.globalModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });
        document.getElementById('chat-settings-page-selector').addEventListener('change', (e) => {
            this.chatModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
            if (e.target.value === 'tab-notes') {
                this.uiManager.notesManager.renderBoard();
            }
        });
        document.getElementById('choices-page-selector').addEventListener('change', (e) => {
            this.choicesModal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
        });

        document.getElementById('set-parallel-count').addEventListener('change', () => this.renderBatchRows());
        document.getElementById('set-choice-parallel-count').addEventListener('change', () => this.renderChoiceBatchRows());
        document.getElementById('set-regex-count').addEventListener('change', () => this.renderRegexRows());

        document.getElementById('btn-fetch-models').addEventListener('click', () => this.handleFetchModels());
        document.getElementById('btn-manage-favorites').addEventListener('click', () => {
            document.getElementById('favorites-container').classList.toggle('hidden');
            this.renderFavoritesList();
        });
        
        document.getElementById('btn-toggle-anote-history').addEventListener('click', () => {
            const container = document.getElementById('anote-history-container');
            container.classList.toggle('hidden');
            if (!container.classList.contains('hidden')) this.renderAnoteHistory();
        });

        document.getElementById('select-model').addEventListener('change', (e) => {
            document.getElementById('set-model').value = e.target.value;
            const draft1Txt = document.getElementById('batch-model-txt-primary');
            if (draft1Txt) draft1Txt.value = e.target.value;
        });

        document.getElementById('select-summarize-model').addEventListener('change', (e) => {
            document.getElementById('set-summarize-model-txt').value = e.target.value;
        });

        // Choices Modal Logic
        document.getElementById('btn-close-choices-settings').addEventListener('click', () => {
            this.closeAndSaveChoicesSettings();
        });
        document.getElementById('btn-edit-choices-toggle').addEventListener('click', () => {
            const isEditing = !document.getElementById('choices-prompt-edit-container').classList.contains('hidden');
            if (isEditing) {
                document.getElementById('choices-prompt-edit-container').classList.add('hidden');
                document.getElementById('choices-prompt-btn-container').classList.remove('hidden');
            } else {
                document.getElementById('choices-prompt-edit-textarea').value = settings.choicesPrompts;
                document.getElementById('choices-prompt-edit-container').classList.remove('hidden');
                document.getElementById('choices-prompt-btn-container').classList.add('hidden');
            }
        });
        document.getElementById('btn-save-choices-prompts').addEventListener('click', () => {
            settings.choicesPrompts = document.getElementById('choices-prompt-edit-textarea').value;
            settings.save();
            document.getElementById('choices-prompt-edit-container').classList.add('hidden');
            document.getElementById('choices-prompt-btn-container').classList.remove('hidden');
            this.renderChoicesPromptsList(); 
        });

        this.bindSamplerPair('slide-context', 'num-context');
        this.bindSamplerPair('slide-max-tokens', 'num-max-tokens');
        this.bindSamplerPair('slide-temp', 'num-temp');
        this.bindSamplerPair('slide-min-p', 'num-min-p');
        this.bindSamplerPair('slide-top-p', 'num-top-p');
        this.bindSamplerPair('slide-top-k', 'num-top-k');
        this.bindSamplerPair('slide-top-a', 'num-top-a');
        this.bindSamplerPair('slide-typical', 'num-typical');
        this.bindSamplerPair('slide-tfs', 'num-tfs');
        this.bindSamplerPair('slide-rep-pen', 'num-rep-pen');

        document.getElementById('btn-neutralize-samplers').addEventListener('click', () => {
            settings.neutralizeSamplers();
            this.populateUI();
        });
    }

    bindSamplerPair(slideId, numId) {
        const slide = document.getElementById(slideId);
        const num = document.getElementById(numId);
        slide.addEventListener('input', (e) => num.value = e.target.value);
        num.addEventListener('input', (e) => slide.value = e.target.value);
    }

    async handleFetchModels() {
        const btn = document.getElementById('btn-fetch-models');
        btn.textContent = "Fetching...";
        btn.disabled = true;
        
        settings.apiUrl = document.getElementById('set-api-url').value.trim();
        settings.apiKey = document.getElementById('set-api-key').value.trim();

        try {
            const models = await OpenAIClient.fetchModels();
            this.cachedFetchedModels = models.map(m => m.id || m.name);
            
            let missing = [];
            
            if (settings.model && !this.cachedFetchedModels.includes(settings.model)) {
                missing.push(`Default: ${settings.model}`);
                settings.model = this.cachedFetchedModels[0] || '';
            }
            if (settings.summarizeModel && !this.cachedFetchedModels.includes(settings.summarizeModel)) {
                missing.push(`Summarize: ${settings.summarizeModel}`);
                settings.summarizeModel = '';
            }
            settings.parallelOverrides.forEach((ov, i) => {
                if (ov.model && !this.cachedFetchedModels.includes(ov.model)) {
                    missing.push(`Parallel Draft ${i+2}: ${ov.model}`);
                    ov.model = '';
                }
            });
            settings.choiceParallelOverrides.forEach((ov, i) => {
                if (ov.model && !this.cachedFetchedModels.includes(ov.model)) {
                    missing.push(`Choice Model ${i+1}: ${ov.model}`);
                    ov.model = '';
                }
            });
            
            const oldFavCount = settings.favoriteModels.length;
            settings.favoriteModels = settings.favoriteModels.filter(m => this.cachedFetchedModels.includes(m));
            if (oldFavCount > settings.favoriteModels.length) {
                missing.push(`${oldFavCount - settings.favoriteModels.length} Favorited Model(s)`);
            }

            if (missing.length > 0) {
                alert("The following models are no longer available and were reset:\n\n" + missing.join("\n"));
                settings.save();
                this.populateUI(); 
            }

            this.updateAllModelDropdowns();
            this.renderFavoritesList();
            btn.textContent = "Success!";
        } catch (e) {
            alert(e.message);
            btn.textContent = "Fetch Failed";
        } finally {
            setTimeout(() => { btn.textContent = "Fetch Models"; btn.disabled = false; }, 2000);
        }
    }

    updateAllModelDropdowns() {
        const createOptions = (selectEl, selectedVal, includeEmptyOverride = false) => {
            if(!selectEl) return;
            let list = this.cachedFetchedModels || settings.favoriteModels;
            const favs = list.filter(m => settings.favoriteModels.includes(m)).sort();
            const others = list.filter(m => !settings.favoriteModels.includes(m)).sort();

            if (includeEmptyOverride) selectEl.innerHTML = '<option value="">(Use Default Model)</option>';
            else selectEl.innerHTML = '<option value="" disabled selected>Select a model...</option>';

            favs.forEach(m => { 
                const opt = document.createElement('option'); 
                opt.value = m; opt.textContent = `⭐ ${m}`; 
                if (m === selectedVal) opt.selected = true;
                selectEl.appendChild(opt); 
            });
            others.forEach(m => { 
                const opt = document.createElement('option'); 
                opt.value = m; opt.textContent = m; 
                if (m === selectedVal) opt.selected = true;
                selectEl.appendChild(opt); 
            });
        };

        createOptions(document.getElementById('select-model'), document.getElementById('set-model').value);
        createOptions(document.getElementById('select-summarize-model'), document.getElementById('set-summarize-model-txt').value, true);
        createOptions(document.getElementById('batch-model-select-primary'), document.getElementById('set-model').value);
        
        const qrPrimaryTxt = document.getElementById('qr-model-txt-primary');
        if (qrPrimaryTxt) createOptions(document.getElementById('qr-model-select-primary'), qrPrimaryTxt.value, true);
        
        for (let i = 0; i < 4; i++) {
            let txtField = document.getElementById(`batch-model-txt-${i}`);
            let currentVal = txtField ? txtField.value : settings.parallelOverrides[i].model;
            createOptions(document.getElementById(`batch-model-select-${i}`), currentVal);
            
            let choiceTxtField = document.getElementById(`choice-batch-model-txt-${i}`);
            let choiceCurrentVal = choiceTxtField ? choiceTxtField.value : settings.choiceParallelOverrides[i].model;
            createOptions(document.getElementById(`choice-batch-model-select-${i}`), choiceCurrentVal);

            let qrTxtField = document.getElementById(`qr-override-txt-${i}`);
            if (qrTxtField) createOptions(document.getElementById(`qr-model-select-${i}`), qrTxtField.value, true);
        }
    }

    renderFavoritesList() {
        const listDiv = document.getElementById('favorites-list');
        listDiv.innerHTML = '';
        const list = this.cachedFetchedModels || settings.favoriteModels;
        const sortedList = [...new Set(list)].sort();

        sortedList.forEach(m => {
            const row = document.createElement('div');
            row.className = 'favorite-item';
            const label = document.createElement('span'); label.textContent = m;
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
            checkbox.checked = settings.favoriteModels.includes(m);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked && !settings.favoriteModels.includes(m)) settings.favoriteModels.push(m);
                else settings.favoriteModels = settings.favoriteModels.filter(f => f !== m);
                settings.save();
                this.updateAllModelDropdowns();
            });
            row.appendChild(label); row.appendChild(checkbox); listDiv.appendChild(row);
        });
    }

    renderBatchRows() {
        const container = document.getElementById('parallel-rows-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('set-parallel-count').value);

        const primaryRow = document.createElement('div');
        primaryRow.className = 'batch-row-container';
        primaryRow.innerHTML = `
            <div class="batch-row-top">Draft 1 (Primary Model)</div>
            <div class="batch-row-bottom">
                <select id="batch-model-select-primary"><option value="" disabled>Select model...</option></select>
                <input type="text" id="batch-model-txt-primary" value="${settings.model}" placeholder="Model ID">
            </div>
        `;
        container.appendChild(primaryRow);

        document.getElementById('batch-model-select-primary').addEventListener('change', (e) => {
            document.getElementById('batch-model-txt-primary').value = e.target.value;
            document.getElementById('set-model').value = e.target.value; 
        });
        document.getElementById('batch-model-txt-primary').addEventListener('input', (e) => {
            document.getElementById('set-model').value = e.target.value; 
        });

        for (let i = 0; i < count - 1; i++) {
            const ov = settings.parallelOverrides[i] || { enabled: false, model: '' };
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            
            row.innerHTML = `
                <div class="batch-row-top">
                    <span>Draft ${i+2}</span>
                    <label style="flex-direction:row; align-items:center;">
                        <input type="checkbox" id="batch-override-chk-${i}" ${ov.enabled ? 'checked' : ''}> Override
                    </label>
                </div>
                <div class="batch-row-bottom">
                    <select id="batch-model-select-${i}"><option value="" disabled>Select model...</option></select>
                    <input type="text" id="batch-model-txt-${i}" value="${ov.model}" placeholder="Model ID">
                </div>
            `;
            container.appendChild(row);

            document.getElementById(`batch-model-select-${i}`).addEventListener('change', (e) => {
                document.getElementById(`batch-model-txt-${i}`).value = e.target.value;
            });
        }
        
        this.updateAllModelDropdowns();
    }

    renderChoiceBatchRows() {
        const container = document.getElementById('choice-parallel-rows-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('set-choice-parallel-count').value);

        for (let i = 0; i < count; i++) {
            const ov = settings.choiceParallelOverrides[i] || { enabled: false, model: '' };
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            
            row.innerHTML = `
                <div class="batch-row-top">
                    <span>Model ${i+1} ${i === 0 ? "(Required)" : ""}</span>
                    <label style="flex-direction:row; align-items:center; ${i === 0 ? 'visibility:hidden;' : ''}">
                        <input type="checkbox" id="choice-batch-override-chk-${i}" ${ov.enabled || i === 0 ? 'checked' : ''}> Enable
                    </label>
                </div>
                <div class="batch-row-bottom">
                    <select id="choice-batch-model-select-${i}"><option value="" disabled>Select model...</option></select>
                    <input type="text" id="choice-batch-model-txt-${i}" value="${ov.model}" placeholder="Leave blank for Default Model">
                </div>
            `;
            container.appendChild(row);

            document.getElementById(`choice-batch-model-select-${i}`).addEventListener('change', (e) => {
                document.getElementById(`choice-batch-model-txt-${i}`).value = e.target.value;
            });
        }
        
        this.updateAllModelDropdowns();
    }

    renderChoicesPromptsList() {
        const container = document.getElementById('choices-prompt-btn-container');
        container.innerHTML = '';
        
        const raw = settings.choicesPrompts || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const btn = document.createElement('button');
            btn.className = 'secondary';
            if (settings.activeChoicePromptTitle === title) btn.classList.add('primary');
            
            btn.textContent = title;
            btn.title = content;
            btn.addEventListener('click', () => {
                settings.activeChoicePromptTitle = title;
                settings.activeChoicePromptText = content;
                settings.save();
                this.renderChoicesPromptsList();
                document.getElementById('lbl-active-choice-prompt').textContent = title;
            });
            container.appendChild(btn);
        });
        document.getElementById('lbl-active-choice-prompt').textContent = settings.activeChoicePromptTitle;
    }

    populateChoicesUI() {
        this.renderChoicesPromptsList();
        document.getElementById('set-choice-parallel-enabled').checked = settings.choiceParallelEnabled;
        document.getElementById('set-choice-parallel-count').value = settings.choiceParallelCount;
        this.renderChoiceBatchRows();
    }

    closeAndSaveChoicesSettings() {
        settings.choiceParallelEnabled = document.getElementById('set-choice-parallel-enabled').checked;
        settings.choiceParallelCount = parseInt(document.getElementById('set-choice-parallel-count').value) || 1;
        for (let i = 0; i < settings.choiceParallelCount; i++) {
            const chk = document.getElementById(`choice-batch-override-chk-${i}`);
            const txt = document.getElementById(`choice-batch-model-txt-${i}`);
            if (chk && txt) {
                settings.choiceParallelOverrides[i] = { enabled: chk.checked, model: txt.value.trim() };
            }
        }
        settings.save();
        this.choicesModal.classList.add('hidden');
    }

    renderRegexRows() {
        const tbody = document.getElementById('regex-tbody');
        const count = parseInt(document.getElementById('set-regex-count').value);
        
        const currentData = [];
        for (let i = 0; i < tbody.children.length; i++) {
            currentData.push({
                pattern: document.getElementById(`reg-pat-${i}`).value,
                replacement: document.getElementById(`reg-rep-${i}`).value,
                applyOutgoing: document.getElementById(`reg-out-${i}`).checked,
                applyVisually: document.getElementById(`reg-vis-${i}`).checked
            });
        }

        tbody.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const rx = currentData[i] || settings.regexes[i] || { pattern:'', replacement:'', applyOutgoing:false, applyVisually:true };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:4px;"><input type="text" id="reg-pat-${i}" value="${rx.pattern}" placeholder="/search/g"></td>
                <td style="padding:4px;"><input type="text" id="reg-rep-${i}" value="${rx.replacement}" placeholder="replace"></td>
                <td style="padding:4px; text-align:center;"><input type="checkbox" id="reg-out-${i}" ${rx.applyOutgoing ? 'checked' : ''}></td>
                <td style="padding:4px; text-align:center;"><input type="checkbox" id="reg-vis-${i}" ${rx.applyVisually ? 'checked' : ''}></td>
            `;
            tbody.appendChild(tr);
        }
    }

    renderAnoteHistory() {
        const tbody = document.getElementById('anote-history-tbody');
        tbody.innerHTML = '';
        if (this.uiManager.state.anoteHistory.length === 0) {
            tbody.innerHTML = '<tr><td style="color:var(--text-muted); text-align:center;">History is empty</td></tr>';
            return;
        }

        this.uiManager.state.anoteHistory.forEach(note => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.textContent = note.length > 80 ? note.substring(0, 80) + '...' : note;
            td.title = note;
            tr.addEventListener('click', () => {
                document.getElementById('set-anote-content').value = note;
                document.getElementById('anote-history-container').classList.add('hidden');
            });
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
    }

    populateUI() {
        document.getElementById('set-api-url').value = settings.apiUrl;
        document.getElementById('set-use-chat').checked = settings.useChatCompletions;
        document.getElementById('set-api-key').value = settings.apiKey;
        document.getElementById('set-model').value = settings.model;
        
        document.getElementById('set-parallel-enabled').checked = settings.parallelEnabled;
        document.getElementById('set-parallel-count').value = settings.parallelCount;
        this.renderBatchRows();

        document.getElementById('set-force-think').checked = settings.forceThink;
        document.getElementById('set-stop-seqs').value = settings.stopSequences;
        
        document.getElementById('set-system-prompt').value = this.uiManager.state.systemPrompt;
        document.getElementById('set-anote-template').value = this.uiManager.state.anoteTemplate;
        document.getElementById('set-anote-content').value = this.uiManager.state.anoteContent;
        document.getElementById('set-anote-unit').value = this.uiManager.state.anoteUnit;
        document.getElementById('set-anote-depth').value = this.uiManager.state.anoteDepth;
        
        document.getElementById('set-summary-content').value = this.uiManager.state.summary;
        document.getElementById('set-track-summary').checked = settings.trackSummary;
        document.getElementById('set-summarize-model-txt').value = settings.summarizeModel;
        if (document.getElementById('lbl-active-sum-prompt')) {
            document.getElementById('lbl-active-sum-prompt').textContent = this.uiManager.state.selectedAutoSumPromptTitle;
        }

        const setPair = (val, slideId, numId) => { document.getElementById(slideId).value = val; document.getElementById(numId).value = val; };
        setPair(settings.contextLength, 'slide-context', 'num-context');
        setPair(settings.maxTokens, 'slide-max-tokens', 'num-max-tokens');
        setPair(settings.temperature, 'slide-temp', 'num-temp');
        setPair(settings.minP, 'slide-min-p', 'num-min-p');
        setPair(settings.topP, 'slide-top-p', 'num-top-p');
        setPair(settings.topK, 'slide-top-k', 'num-top-k');
        setPair(settings.topA, 'slide-top-a', 'num-top-a');
        setPair(settings.typical, 'slide-typical', 'num-typical');
        setPair(settings.tfs, 'slide-tfs', 'num-tfs');
        setPair(settings.repPen, 'slide-rep-pen', 'num-rep-pen');

        document.getElementById('num-chars-token').value = settings.charsPerToken;

        document.getElementById('set-display-mode').value = settings.displayMode;
        document.getElementById('set-theme').value = settings.theme;
        document.getElementById('set-visible-ooc').value = settings.visibleOutOfContext;
        document.getElementById('set-render-markdown').checked = settings.renderMarkdown;
        document.getElementById('set-regex-count').value = settings.regexes.length;
        this.renderRegexRows();

        this.updateAllModelDropdowns();
    }

    closeAndSave() {
        settings.apiUrl = document.getElementById('set-api-url').value.trim();
        settings.useChatCompletions = document.getElementById('set-use-chat').checked;
        settings.apiKey = document.getElementById('set-api-key').value.trim();
        settings.model = document.getElementById('set-model').value.trim();

        settings.parallelEnabled = document.getElementById('set-parallel-enabled').checked;
        settings.parallelCount = parseInt(document.getElementById('set-parallel-count').value);
        for (let i = 0; i < settings.parallelCount - 1; i++) {
            const chk = document.getElementById(`batch-override-chk-${i}`);
            const txt = document.getElementById(`batch-model-txt-${i}`);
            if (chk && txt) {
                settings.parallelOverrides[i] = { enabled: chk.checked, model: txt.value.trim() };
            }
        }

        settings.forceThink = document.getElementById('set-force-think').checked;
        settings.stopSequences = document.getElementById('set-stop-seqs').value;
        
        settings.contextLength = parseInt(document.getElementById('num-context').value);
        settings.maxTokens = parseInt(document.getElementById('num-max-tokens').value);
        settings.charsPerToken = parseFloat(document.getElementById('num-chars-token').value);
        settings.temperature = parseFloat(document.getElementById('num-temp').value);
        settings.minP = parseFloat(document.getElementById('num-min-p').value);
        settings.topP = parseFloat(document.getElementById('num-top-p').value);
        settings.topK = parseInt(document.getElementById('num-top-k').value);
        settings.topA = parseFloat(document.getElementById('num-top-a').value);
        settings.typical = parseFloat(document.getElementById('num-typical').value);
        settings.tfs = parseFloat(document.getElementById('num-tfs').value);
        settings.repPen = parseFloat(document.getElementById('num-rep-pen').value);

        settings.displayMode = document.getElementById('set-display-mode').value;
        settings.theme = document.getElementById('set-theme').value;
        settings.visibleOutOfContext = parseInt(document.getElementById('set-visible-ooc').value);
        settings.renderMarkdown = document.getElementById('set-render-markdown').checked;
        
        const rxCount = parseInt(document.getElementById('set-regex-count').value);
        settings.regexes = [];
        for (let i = 0; i < rxCount; i++) {
            settings.regexes.push({
                pattern: document.getElementById(`reg-pat-${i}`).value,
                replacement: document.getElementById(`reg-rep-${i}`).value,
                applyOutgoing: document.getElementById(`reg-out-${i}`).checked,
                applyVisually: document.getElementById(`reg-vis-${i}`).checked
            });
        }
        
        settings.save();
        
        document.documentElement.setAttribute('data-theme', settings.theme);
        this.uiManager.state.buildPromptPayload(); 
        this.uiManager.renderAll(); 

        this.globalModal.classList.add('hidden');
    }

    closeAndSaveChatSettings() {
        const newSysPrompt = document.getElementById('set-system-prompt').value;
        const oldSysPrompt = this.uiManager.state.systemPrompt;
        
        // Push to History if changed
        if (newSysPrompt !== oldSysPrompt) {
            if (!this.uiManager.state.systemPromptHistory) this.uiManager.state.systemPromptHistory = [];
            if (oldSysPrompt.trim() !== '') {
                this.uiManager.state.systemPromptHistory.unshift({
                    text: oldSysPrompt,
                    timestamp: Date.now()
                });
                if (this.uiManager.state.systemPromptHistory.length > 5) {
                    this.uiManager.state.systemPromptHistory.pop();
                }
            }
        }
        
        this.uiManager.state.systemPrompt = newSysPrompt;
        this.uiManager.state.anoteTemplate = document.getElementById('set-anote-template').value;
        this.uiManager.state.anoteContent = document.getElementById('set-anote-content').value;
        this.uiManager.state.anoteUnit = document.getElementById('set-anote-unit').value;
        this.uiManager.state.anoteDepth = parseInt(document.getElementById('set-anote-depth').value);

        const currentAnote = this.uiManager.state.anoteContent.trim();
        if (currentAnote) {
            if (this.uiManager.state.anoteHistory[0] !== currentAnote) {
                this.uiManager.state.anoteHistory.unshift(currentAnote);
                if (this.uiManager.state.anoteHistory.length > 10) this.uiManager.state.anoteHistory.length = 10;
            }
        }

        this.uiManager.state.summary = document.getElementById('set-summary-content').value;
        settings.trackSummary = document.getElementById('set-track-summary').checked;
        settings.summarizeModel = document.getElementById('set-summarize-model-txt').value.trim();

        settings.save();
        this.uiManager.autoSave();
        
        this.uiManager.state.buildPromptPayload(); 
        this.uiManager.renderAll();

        this.chatModal.classList.add('hidden');
    }
}
