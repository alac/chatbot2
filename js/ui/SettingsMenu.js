import { settings } from '../state/AppSettings.js';

export class SettingsMenu {
    constructor() {
        this.modal = document.getElementById('settings-modal');
        this.btnOpen = document.getElementById('btn-settings');
        this.btnClose = document.getElementById('btn-close-settings');
        this.tabs = document.querySelectorAll('.tab-btn');
        
        // Inputs
        this.inputs = {
            apiUrl: document.getElementById('set-api-url'),
            apiKey: document.getElementById('set-api-key'),
            model: document.getElementById('set-model'),
            systemPrompt: document.getElementById('set-system-prompt'),
            temp: document.getElementById('set-temp'),
            maxTokens: document.getElementById('set-max-tokens')
        };

        this.bindEvents();
        this.populateUI();
    }

    bindEvents() {
        this.btnOpen.addEventListener('click', () => this.modal.classList.remove('hidden'));
        this.btnClose.addEventListener('click', () => this.closeAndSave());
        
        // Click outside modal to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeAndSave();
        });

        // Tabs
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.add('active');
            });
        });

        // Live value updates for sliders
        this.inputs.temp.addEventListener('input', (e) => document.getElementById('val-temp').textContent = e.target.value);
        this.inputs.maxTokens.addEventListener('input', (e) => document.getElementById('val-max-tokens').textContent = e.target.value);
    }

    populateUI() {
        this.inputs.apiUrl.value = settings.apiUrl;
        this.inputs.apiKey.value = settings.apiKey;
        this.inputs.model.value = settings.model;
        this.inputs.systemPrompt.value = settings.systemPrompt;
        
        this.inputs.temp.value = settings.temperature;
        document.getElementById('val-temp').textContent = settings.temperature;
        
        this.inputs.maxTokens.value = settings.maxTokens;
        document.getElementById('val-max-tokens').textContent = settings.maxTokens;
    }

    closeAndSave() {
        settings.apiUrl = this.inputs.apiUrl.value.trim();
        settings.apiKey = this.inputs.apiKey.value.trim();
        settings.model = this.inputs.model.value.trim();
        settings.systemPrompt = this.inputs.systemPrompt.value;
        settings.temperature = parseFloat(this.inputs.temp.value);
        settings.maxTokens = parseInt(this.inputs.maxTokens.value);
        
        settings.save();
        this.modal.classList.add('hidden');
    }
}