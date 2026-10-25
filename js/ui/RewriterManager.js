// BEGIN FILE: js/ui/RewriterManager.js
import { settings } from '../state/AppSettings.js';
import { LocalRewriterEngine } from '../api/LocalRewriterEngine.js';
import { diffWords } from '../utils/diff.js';
import { getCharOffsetsFromBlocks, expandToSentenceBoundaries } from '../utils/textUtils.js';

export class RewriterManager {
    constructor(app) {
        this.app = app;
        this.engine = new LocalRewriterEngine();
        this.isModalOpen = false;
        this.bindEvents();
    }

    bindEvents() {
        // Tools Tab controls
        document.getElementById('tool-rewriter-model').addEventListener('change', (e) => {
            settings.rewriterModel = e.target.value;
            settings.save();
        });
        document.getElementById('btn-tool-rewriter-load').addEventListener('click', () => this.loadModel());
        document.getElementById('btn-tool-rewriter-unload').addEventListener('click', () => this.unloadModel());

        // Rewrite Modal controls
        document.getElementById('btn-close-rewrite').addEventListener('click', () => {
            this.isModalOpen = false;
            document.getElementById('rewrite-modal').classList.add('hidden');
        });
    }

    populateUI() {
        document.getElementById('tool-rewriter-model').value = settings.rewriterModel || 'alac/flan-t5-deslop-onnx';
        this.updateToolUIState();
    }

    updateToolUIState() {
        const loadBtn = document.getElementById('btn-tool-rewriter-load');
        const unloadBtn = document.getElementById('btn-tool-rewriter-unload');
        const select = document.getElementById('tool-rewriter-model');
        
        if (this.engine.isLoading) {
            loadBtn.disabled = true;
            unloadBtn.disabled = true;
            select.disabled = true;
        } else if (this.engine.isReady) {
            loadBtn.disabled = true;
            unloadBtn.disabled = false;
            select.disabled = true;
        } else {
            loadBtn.disabled = false;
            unloadBtn.disabled = true;
            select.disabled = false;
        }
    }

    async loadModel() {
        const modelId = document.getElementById('tool-rewriter-model').value;
        const progressBar = document.getElementById('rewriter-progress-fill');
        const statusText = document.getElementById('rewriter-status-text');
        
        progressBar.style.width = '0%';
        this.updateToolUIState();

        await this.engine.loadModel(
            modelId,
            (data) => {
                if (data.status === 'progress') {
                    progressBar.style.width = `${Math.round(data.progress)}%`;
                }
            },
            (status) => {
                statusText.textContent = status;
            }
        );
        this.updateToolUIState();
    }

    async unloadModel() {
        await this.engine.unload();
        document.getElementById('rewriter-progress-fill').style.width = '0%';
        document.getElementById('rewriter-status-text').textContent = 'Model unloaded. Memory freed.';
        this.updateToolUIState();
    }

    async openRewriteModal(pendingSelection) {
        if (!this.engine.isReady) {
            alert("Please load a rewriter model in the Tools > Local Rewriter tab first.");
            return;
        }

        const { msgIndex, startBlockIdx, endBlockIdx } = pendingSelection;
        const msg = this.app.state.history[msgIndex];
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        const fullText = activeDraft.content || '';
        
        // 1. Convert AST blocks to absolute char offsets
        const tokens = marked.lexer(fullText);
        const rawBlocks = tokens.map(t => t.raw);
        const { startChar, endChar } = getCharOffsetsFromBlocks(
            rawBlocks, 
            startBlockIdx, 
            endBlockIdx, 
            pendingSelection.intraBlockStart, 
            pendingSelection.intraBlockEnd
        );
        
        // 2. Expand out to nearest sentence boundaries
        const boundaryInfo = expandToSentenceBoundaries(fullText, startChar, endChar);
        const originalSentence = boundaryInfo.expandedText.trim();

        if (!originalSentence) return;

        // 3. Setup Modal UI
        this.isModalOpen = true;
        document.getElementById('rewrite-original-text').textContent = originalSentence;
        const container = document.getElementById('rewrite-iterations-container');
        container.innerHTML = '';
        document.getElementById('rewrite-modal').classList.remove('hidden');

        // 4. Run iterations iteratively
        let currentInput = originalSentence;
        
        for (let i = 1; i <= 4; i++) {
            if (!this.isModalOpen) break; // User closed modal
            
            const cell = this.createIterationCell(i);
            container.appendChild(cell);
            
            const startTime = performance.now();
            try {
                const outputText = await this.engine.rewrite(currentInput);
                if (!this.isModalOpen) break;
                
                const duration = (performance.now() - startTime).toFixed(0);
                const approxTokens = outputText.split(' ').length * 1.3;
                const tps = (approxTokens / (duration / 1000)).toFixed(1);

                this.finalizeIterationCell(cell, originalSentence, outputText, `${duration}ms (~${tps} t/s)`, () => {
                    this.applyRewrite(msgIndex, boundaryInfo.startIndex, boundaryInfo.endIndex, originalSentence, outputText);
                });
                
                currentInput = outputText; // Feed output to next iteration
            } catch (err) {
                cell.querySelector('.rw-content').textContent = `Error: ${err.message}`;
                break;
            }
        }
    }

    createIterationCell(iterNumber) {
        const div = document.createElement('div');
        div.className = 'rw-card';
        div.innerHTML = `
            <div class="rw-header">
                <span>Iteration ${iterNumber}</span>
                <span class="rw-meta streaming-indicator" style="display:inline-block; height:12px; margin-left:8px;"></span>
            </div>
            <div class="rw-content" style="color:var(--text-muted); font-style:italic;">Generating...</div>
            <div class="rw-actions hidden">
                <button class="primary rw-btn-apply">✔️ Apply</button>
            </div>
        `;
        return div;
    }

    finalizeIterationCell(cell, original, rewritten, metrics, onApply) {
        const diffs = diffWords(original, rewritten);
        cell.querySelector('.rw-header .rw-meta').textContent = metrics;
        cell.querySelector('.rw-header .rw-meta').classList.remove('streaming-indicator');
        cell.querySelector('.rw-content').style.color = 'inherit';
        cell.querySelector('.rw-content').style.fontStyle = 'normal';
        // Render diff relative to the original
        cell.querySelector('.rw-content').innerHTML = diffs.newHtml; 
        
        const actions = cell.querySelector('.rw-actions');
        actions.classList.remove('hidden');
        actions.querySelector('.rw-btn-apply').addEventListener('click', onApply);
    }

    applyRewrite(msgIndex, replaceStart, replaceEnd, originalText, newText) {
        const fullText = this.app.state.getContent(msgIndex);
        const updatedFullText = fullText.slice(0, replaceStart) + newText + fullText.slice(replaceEnd);
        
        // Log to training dataset via editTurn logic
        this.app.state.recordEdit(originalText, newText, 'local_rewriter');
        this.app.state.editTurn(msgIndex, updatedFullText);
        
        this.isModalOpen = false;
        document.getElementById('rewrite-modal').classList.add('hidden');
        this.app.renderAll();
        this.app.autoSave();
    }
}
// END FILE: js/ui/RewriterManager.js