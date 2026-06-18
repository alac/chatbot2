// BEGIN FILE: js/ui/ToolsManager.js
import { settings } from '../state/AppSettings.js';
import { DiceRoller } from '../utils/DiceRoller.js';
import { NameGenerator } from '../utils/NameGenerator.js';
import { nameDatasets } from '../data/names.js'; // Ensure this path is correct

export class ToolsManager {
    constructor(app) {
        this.app = app;
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-open-tools').addEventListener('click', () => this.openToolsMenu());
        document.getElementById('btn-close-tools').addEventListener('click', () => document.getElementById('tools-modal').classList.add('hidden'));
        
        document.getElementById('tools-page-selector').addEventListener('change', (e) => {
            document.getElementById('tools-modal').querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(e.target.value).classList.add('active');
            
            if (e.target.value === 'tab-tool-aggregate') this.populateDraftAggregatorUI();
        });

        // 1. Dice Tool
        document.querySelectorAll('.btn-dice-preset').forEach(btn => {
            btn.addEventListener('click', (e) => document.getElementById('tool-dice-notation').value = e.target.dataset.val);
        });
        document.getElementById('btn-tool-dice-roll').addEventListener('click', () => this.executeDiceRoll());

        // 2. Names Generator
        document.getElementById('btn-tool-names-gen').addEventListener('click', () => this.executeNamesGeneration());
        
        // 3. Draft Aggregator
        document.getElementById('btn-tool-agg-run').addEventListener('click', () => this.executeDraftAggregation());

        document.getElementById('btn-open-agg-history').addEventListener('click', () => {
            this.renderAggHistory();
            document.getElementById('agg-history-modal').classList.remove('hidden');
        });
        document.getElementById('btn-close-agg-history').addEventListener('click', () => {
            document.getElementById('agg-history-modal').classList.add('hidden');
        });
    }

    openToolsMenu() {
        document.getElementById('quick-menu').classList.add('hidden');
        
        // Load persist states
        document.getElementById('tool-dice-notation').value = settings.diceNotation;
        document.getElementById('tool-names-theme').value = this.app.state.nameTheme;
        document.getElementById('tool-names-male').value = this.app.state.nameCountMale;
        document.getElementById('tool-names-female').value = this.app.state.nameCountFemale;
        
        // If aggregate tab is active initially
        if (document.getElementById('tools-page-selector').value === 'tab-tool-aggregate') {
            this.populateDraftAggregatorUI();
        }
        
        document.getElementById('tools-modal').classList.remove('hidden');
    }

    executeDiceRoll() {
        const notationInput = document.getElementById('tool-dice-notation').value.trim();
        try {
            const result = DiceRoller.roll(notationInput);
            settings.diceNotation = result.notation;
            settings.save();
            
            this.app.state.addTurn('system', result.message);
            document.getElementById('tools-modal').classList.add('hidden');
            this.app.renderAll();
            this.app.autoSave();
        } catch (err) {
            alert(err.message);
        }
    }

    executeNamesGeneration() {
        const theme = document.getElementById('tool-names-theme').value;
        const countMale = parseInt(document.getElementById('tool-names-male').value) || 0;
        const countFemale = parseInt(document.getElementById('tool-names-female').value) || 0;

        try {
            const dataset = nameDatasets[theme];
            const outputText = NameGenerator.generate(theme, countMale, countFemale, dataset);
            
            this.app.state.nameTheme = theme;
            this.app.state.nameCountMale = countMale;
            this.app.state.nameCountFemale = countFemale;

            this.app.state.addTurn('system', outputText);
            document.getElementById('tools-modal').classList.add('hidden');
            this.app.renderAll();
            this.app.autoSave();
        } catch (err) {
            alert(err.message);
        }
    }

    populateDraftAggregatorUI() {
        const container = document.getElementById('tool-agg-drafts-container');
        container.innerHTML = '';
        
        if (this.app.state.history.length === 0) {
            container.innerHTML = `<span style="color:var(--text-muted);">No chat history.</span>`;
            return;
        }

        const lastIdx = this.app.state.history.length - 1;
        const lastMsg = this.app.state.history[lastIdx];

        if (lastMsg.role !== 'assistant') {
            container.innerHTML = `<span style="color:var(--text-muted);">The last message is not an assistant response.</span>`;
            return;
        }

        const draftsToScan = lastMsg.isBatch ? lastMsg.drafts : [lastMsg.drafts[lastMsg.activeDraftIndex]];
        container.innerHTML = `<div class="ae-group-header">Available Drafts to Combine</div>`;
        
        draftsToScan.forEach((draft, i) => {
            if (!draft.content) return;
            const modelName = draft.model ? draft.model.split('/').pop() : 'Unknown';
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.marginTop = '6px';
            label.style.cursor = 'pointer';
            
            label.innerHTML = `
                <input type="checkbox" class="agg-draft-chk" data-idx="${i}" checked>
                <span style="font-size:0.9em;">Draft ${i+1} (${modelName})</span>
            `;
            container.appendChild(label);
        });
        
        container.dataset.msgIdx = lastIdx;
    }

    executeDraftAggregation() {
        const container = document.getElementById('tool-agg-drafts-container');
        const lastIdx = parseInt(container.dataset.msgIdx);
        
        if (isNaN(lastIdx)) return alert("Invalid message to aggregate.");
        
        const lastMsg = this.app.state.history[lastIdx];
        const selectedIndices = Array.from(document.querySelectorAll('.agg-draft-chk:checked')).map(cb => parseInt(cb.dataset.idx));

        if (selectedIndices.length === 0) return alert("Select at least one draft to aggregate.");

        const instructions = document.getElementById('tool-agg-instructions').value.trim();
        if (!instructions) return alert("Please provide aggregation instructions.");

        this.app.state.aggregationHistory = this.app.state.aggregationHistory.filter(i => i !== instructions);
        this.app.state.aggregationHistory.unshift(instructions);
        if (this.app.state.aggregationHistory.length > 20) this.app.state.aggregationHistory.length = 20;

        let fullPayloadText = `These are variations of the same response. We want to aggregate them according to this request: ${instructions}\n\n`;
        
        selectedIndices.forEach(idx => {
            fullPayloadText += `<response${idx+1}>\n${lastMsg.drafts[idx].content}\n</response${idx+1}>\n\n`;
        });
        
        fullPayloadText += `Reminder, we want to aggregate the above responses according to request: ${instructions}`;

        this.app.state.addTurn('aggregation', fullPayloadText, '', { 
            displayInput: instructions,
            aggregatedMsgIndex: lastIdx
        });
        
        document.getElementById('tools-modal').classList.add('hidden');
        document.getElementById('tool-agg-instructions').value = '';
        
        this.app.input.value = '';
        this.app.handleSend(); 
    }

    renderAggHistory() {
        const tbody = document.getElementById('agg-history-tbody');
        tbody.innerHTML = '';
        if (!this.app.state.aggregationHistory || this.app.state.aggregationHistory.length === 0) {
            tbody.innerHTML = '<tr><td style="color:var(--text-muted); text-align:center; padding: 12px;">No history available.</td></tr>';
            return;
        }

        this.app.state.aggregationHistory.forEach(inst => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.textContent = inst.length > 120 ? inst.substring(0, 120) + '...' : inst;
            td.title = inst;
            
            tr.addEventListener('click', () => {
                document.getElementById('tool-agg-instructions').value = inst;
                document.getElementById('agg-history-modal').classList.add('hidden');
            });
            
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
    }
}