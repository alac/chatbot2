// BEGIN FILE: js/ui/QuickRepliesManager.js
import { settings } from '../state/AppSettings.js';

export class QuickRepliesManager {
    constructor(app) {
        this.app = app;
        this.currentQROverrides = [];
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-open-quick-replies').addEventListener('click', () => this.openQuickReplies());
        document.getElementById('btn-close-qr').addEventListener('click', () => document.getElementById('quick-replies-modal').classList.add('hidden'));
        
        const showQRView = (viewId) => {
            ['qr-button-container', 'qr-edit-container', 'qr-models-container'].forEach(id => {
                document.getElementById(id).classList.add('hidden');
            });
            document.getElementById(viewId).classList.remove('hidden');
        };

        document.getElementById('btn-edit-qr-toggle').addEventListener('click', () => {
            if (!document.getElementById('qr-edit-container').classList.contains('hidden')) {
                showQRView('qr-button-container');
            } else {
                document.getElementById('qr-edit-textarea').value = settings.quickReplies;
                showQRView('qr-edit-container');
            }
        });
        
        document.getElementById('btn-models-qr-toggle').addEventListener('click', () => {
            if (!document.getElementById('qr-models-container').classList.contains('hidden')) {
                showQRView('qr-button-container');
            } else {
                this.populateQRModelsUI();
                showQRView('qr-models-container');
            }
        });

        document.getElementById('btn-save-qr').addEventListener('click', () => {
            settings.quickReplies = document.getElementById('qr-edit-textarea').value;
            settings.save();
            this.openQuickReplies(); 
            showQRView('qr-button-container');
        });
        
        document.getElementById('qr-model-select-primary').addEventListener('change', (e) => {
            document.getElementById('qr-model-txt-primary').value = e.target.value;
        });

        document.getElementById('qr-model-select').addEventListener('change', (e) => this.loadQRModelConfig(e.target.value));
        document.getElementById('qr-model-enable').addEventListener('change', (e) => {
            if (e.target.checked) document.getElementById('qr-model-config').classList.remove('hidden');
            else document.getElementById('qr-model-config').classList.add('hidden');
        });
        document.getElementById('qr-model-count').addEventListener('change', () => this.renderQRModelRows());

        document.getElementById('btn-save-qr-models').addEventListener('click', () => {
            const title = document.getElementById('qr-model-select').value;
            if (!title) return;
            
            const count = parseInt(document.getElementById('qr-model-count').value) || 1;
            const overrides = [];
            for (let i = 0; i < count - 1; i++) {
                const chk = document.getElementById(`qr-override-chk-${i}`);
                const txt = document.getElementById(`qr-override-txt-${i}`);
                overrides.push({
                    enabled: chk ? chk.checked : false,
                    model: txt ? txt.value.trim() : ''
                });
            }
            
            settings.qrModels[title] = {
                enabled: document.getElementById('qr-model-enable').checked,
                draft1Model: document.getElementById('qr-model-txt-primary').value.trim(),
                count: count,
                overrides: overrides
            };
            settings.save();
            showQRView('qr-button-container');
        });
    }

    openQuickReplies() {
        const container = document.getElementById('qr-button-container');
        container.innerHTML = '';
        const raw = settings.quickReplies || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        parts.forEach(p => {
            const lines = p.trim().split('\n');
            const title = lines.shift().trim();
            const content = lines.join('\n').trim();
            
            const card = document.createElement('div');
            card.className = 'choice-card';
            card.style.flexDirection = 'row';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'space-between';
            card.style.padding = '8px 12px';
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = title;
            titleSpan.style.fontWeight = 'bold';
            titleSpan.title = content;
            
            const actions = document.createElement('div');
            actions.className = 'choice-card-actions';
            
            const btnInsert = document.createElement('button');
            btnInsert.textContent = '📝';
            btnInsert.title = 'Insert to input';
            btnInsert.onclick = () => {
                this.app.input.value = this.app.input.value ? this.app.input.value + ' ' + content : content;
                this.app.input.style.height = 'auto';
                this.app.input.style.height = (this.app.input.scrollHeight) + 'px';
                this.app.input.focus();
                document.getElementById('quick-replies-modal').classList.add('hidden');
            };
            
            const btnSend = document.createElement('button');
            btnSend.textContent = '🚀';
            btnSend.title = 'Send instantly';
            btnSend.onclick = () => {
                this.app.input.value = content;
                document.getElementById('quick-replies-modal').classList.add('hidden');
                const qrConfig = settings.qrModels?.[title];
                if (qrConfig && qrConfig.enabled) {
                    this.app.overrideNextSend = qrConfig;
                }
                this.app.handleSend();
            };
            
            actions.appendChild(btnInsert);
            actions.appendChild(btnSend);
            card.appendChild(titleSpan);
            card.appendChild(actions);
            container.appendChild(card);
        });
        document.getElementById('quick-replies-modal').classList.remove('hidden');
    }

    populateQRModelsUI() {
        const select = document.getElementById('qr-model-select');
        select.innerHTML = '';
        
        const raw = settings.quickReplies || "";
        const parts = raw.split('::').filter(p => p.trim() !== '');
        
        if (parts.length === 0) {
            select.innerHTML = '<option value="">No Quick Replies found</option>';
            return;
        }
        
        parts.forEach(p => {
            const title = p.trim().split('\n')[0].trim();
            const opt = document.createElement('option');
            opt.value = title;
            opt.textContent = title;
            select.appendChild(opt);
        });
        
        this.loadQRModelConfig(select.value);
    }

    loadQRModelConfig(title) {
        const config = settings.qrModels?.[title] || { enabled: false, count: 1, draft1Model: '', overrides: [] };
        
        document.getElementById('qr-model-enable').checked = config.enabled;
        if (config.enabled) document.getElementById('qr-model-config').classList.remove('hidden');
        else document.getElementById('qr-model-config').classList.add('hidden');
        
        document.getElementById('qr-model-count').value = config.count || 1;
        document.getElementById('qr-model-txt-primary').value = config.draft1Model || '';
        
        this.currentQROverrides = config.overrides || [];
        this.renderQRModelRows();
    }

    renderQRModelRows() {
        const container = document.getElementById('qr-model-overrides-container');
        container.innerHTML = '';
        const count = parseInt(document.getElementById('qr-model-count').value) || 1;
        
        for (let i = 0; i < count - 1; i++) {
            const ov = this.currentQROverrides[i] || { enabled: false, model: '' };
            const row = document.createElement('div');
            row.className = 'batch-row-container';
            row.innerHTML = `
                <div class="batch-row-top">
                    <span>Draft ${i+2}</span>
                    <label style="flex-direction:row; align-items:center;">
                        <input type="checkbox" id="qr-override-chk-${i}" ${ov.enabled ? 'checked' : ''}> Override
                    </label>
                </div>
                <div class="batch-row-bottom">
                    <select id="qr-model-select-${i}"><option value="" disabled>Select model...</option></select>
                    <input type="text" id="qr-override-txt-${i}" value="${ov.model}" placeholder="Leave blank for default">
                </div>
            `;
            container.appendChild(row);

            document.getElementById(`qr-model-select-${i}`).addEventListener('change', (e) => {
                document.getElementById(`qr-override-txt-${i}`).value = e.target.value;
            });
        }
        
        if (window.settingsUI) window.settingsUI.updateAllModelDropdowns();
    }
}