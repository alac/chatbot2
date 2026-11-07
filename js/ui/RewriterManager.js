import { settings } from '../state/AppSettings.js';
import { LocalRewriterEngine } from '../api/LocalRewriterEngine.js';
import { diffWords } from '../utils/diff.js';
import { getCharOffsetsFromBlocks, expandToSentenceBoundaries } from '../utils/textUtils.js';

export class RewriterManager {
    constructor(app) {
        this.app = app;
        this.engine = new LocalRewriterEngine();
        this.isModalOpen = false;

        // Staged full-message rewrite state
        this.stagedMsgIndex = null;
        this.stagedOriginalText = '';
        this.sentenceList = [];
        this.isQueueRunning = false;
        this.isQueueAborted = false;

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

        // Single Sentence Rewrite Modal controls
        document.getElementById('btn-close-rewrite').addEventListener('click', () => {
            this.isModalOpen = false;
            document.getElementById('rewrite-modal').classList.add('hidden');
        });

        // Staged Sentence Rewrite Modal controls
        document.getElementById('btn-close-staged-rewrite').addEventListener('click', () => this.cancelStagedRewrite());
        document.getElementById('btn-sr-cancel').addEventListener('click', () => this.cancelStagedRewrite());
        document.getElementById('btn-sr-stop').addEventListener('click', () => this.stopQueue());
        document.getElementById('btn-sr-apply').addEventListener('click', () => this.applyStagedRewrite());
        
        document.getElementById('sr-show-deletions').addEventListener('change', (e) => {
            const list = document.getElementById('sr-sentence-list');
            if (e.target.checked) {
                list.classList.remove('hide-deletions');
            } else {
                list.classList.add('hide-deletions');
            }
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

    // -------------------------------------------------------------------------
    // SINGLE SENTENCE REWRITE MODAL (4 Iterations)
    // -------------------------------------------------------------------------

    async openRewriteModal(pendingSelection) {
        if (!this.engine.isReady) {
            alert("Please load a rewriter model in the Tools > Local Rewriter tab first.");
            return;
        }

        const { msgIndex, startBlockIdx, endBlockIdx } = pendingSelection;
        const msg = this.app.state.history[msgIndex];
        const activeDraft = msg.drafts[msg.activeDraftIndex];
        const fullText = activeDraft.content || '';
        
        const tokens = marked.lexer(fullText);
        const rawBlocks = tokens.map(t => t.raw);
        const { startChar, endChar } = getCharOffsetsFromBlocks(
            rawBlocks, 
            startBlockIdx, 
            endBlockIdx, 
            pendingSelection.intraBlockStart, 
            pendingSelection.intraBlockEnd
        );
        
        const boundaryInfo = expandToSentenceBoundaries(fullText, startChar, endChar);
        const originalSentence = boundaryInfo.expandedText.trim();

        if (!originalSentence) return;

        this.isModalOpen = true;
        document.getElementById('rewrite-original-text').textContent = originalSentence;
        const container = document.getElementById('rewrite-iterations-container');
        container.innerHTML = '';
        document.getElementById('rewrite-modal').classList.remove('hidden');

        let currentInput = originalSentence;
        
        for (let i = 1; i <= 4; i++) {
            if (!this.isModalOpen) break;
            
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
                
                currentInput = outputText;
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
        cell.querySelector('.rw-content').innerHTML = diffs.newHtml; 
        
        const actions = cell.querySelector('.rw-actions');
        actions.classList.remove('hidden');
        actions.querySelector('.rw-btn-apply').addEventListener('click', onApply);
    }

    applyRewrite(msgIndex, replaceStart, replaceEnd, originalText, newText) {
        const fullText = this.app.state.getContent(msgIndex);
        const updatedFullText = fullText.slice(0, replaceStart) + newText + fullText.slice(replaceEnd);
        
        this.app.state.recordEdit(originalText, newText, 'local_rewriter');
        this.app.state.editTurn(msgIndex, updatedFullText);
        
        this.isModalOpen = false;
        document.getElementById('rewrite-modal').classList.add('hidden');
        this.app.renderAll();
        this.app.autoSave();
    }

    // -------------------------------------------------------------------------
    // STAGED SENTENCE-BY-SENTENCE FULL REWRITE
    // -------------------------------------------------------------------------

    openStagedRewriteModal(msgIndex) {
        if (!this.engine.isReady) {
            alert("Please load a rewriter model in the Tools > Local Rewriter tab first.");
            return;
        }

        const msg = this.app.state.history[msgIndex];
        if (!msg) return;

        this.stagedMsgIndex = msgIndex;
        this.stagedOriginalText = this.app.state.getContent(msgIndex);
        if (!this.stagedOriginalText.trim()) return;

        // Phase 1: Segmentation & Whitespace Decoupling
        this.sentenceList = this.segmentText(this.stagedOriginalText);
        if (this.sentenceList.length === 0) return;

        this.isQueueRunning = false;
        this.isQueueAborted = false;

        this.renderStagedModal();
        document.getElementById('staged-rewrite-modal').classList.remove('hidden');

        // Sync checkbox state for deletions
        const showDeletions = document.getElementById('sr-show-deletions').checked;
        const list = document.getElementById('sr-sentence-list');
        if (showDeletions) {
            list.classList.remove('hide-deletions');
        } else {
            list.classList.add('hide-deletions');
        }

        // Start sequential queue processing
        this.startQueue();
    }

    segmentText(fullText) {
        let rawSegments = [];
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
            rawSegments = Array.from(segmenter.segment(fullText)).map(s => ({
                segment: s.segment,
                index: s.index
            }));
        } else {
            const regex = /[^.!?\n]+(?:[.!?]+|\n+|$)/g;
            let m;
            while ((m = regex.exec(fullText)) !== null) {
                rawSegments.push({ segment: m[0], index: m.index });
            }
        }

        return rawSegments.map((item, idx) => {
            const match = item.segment.match(/^(\s*)([\s\S]*?)(\s*)$/);
            const prefix = match ? match[1] : '';
            const core   = match ? match[2] : item.segment;
            const suffix = match ? match[3] : '';
            const isWhitespaceOnly = core.length === 0;

            return {
                id: `sent_${idx}`,
                index: item.index,
                length: item.segment.length,
                original: item.segment,
                prefix,
                core,
                suffix,
                rewritten: isWhitespaceOnly ? item.segment : '',
                useRewritten: !isWhitespaceOnly,
                status: isWhitespaceOnly ? 'skipped' : 'pending'
            };
        });
    }

    renderStagedModal() {
        const container = document.getElementById('sr-sentence-list');
        container.innerHTML = '';

        this.sentenceList.forEach((item, idx) => {
            const card = document.createElement('div');
            card.id = `sr-row-${item.id}`;
            card.className = `sr-card ${item.status === 'skipped' ? 'skipped' : ''}`;

            const header = document.createElement('div');
            header.className = 'sr-card-header';

            const numSpan = document.createElement('span');
            numSpan.className = 'sr-card-num';
            numSpan.textContent = `Sentence ${idx + 1} of ${this.sentenceList.length}`;

            const badge = document.createElement('span');
            badge.id = `sr-badge-${item.id}`;
            badge.className = `sr-badge sr-badge-${item.status}`;
            badge.textContent = item.status === 'skipped' ? 'Skipped' : 'Pending';

            header.appendChild(numSpan);
            header.appendChild(badge);

            const content = document.createElement('div');
            content.id = `sr-content-${item.id}`;
            content.className = 'sr-card-content';
            content.textContent = item.core || item.original;

            card.appendChild(header);
            card.appendChild(content);

            // Allow clicking the card or badge once done to toggle
            card.addEventListener('click', (e) => {
                if (item.status === 'done') {
                    this.toggleSentence(idx);
                }
            });

            container.appendChild(card);
        });

        this.updateProgressUI();
    }

    updateProgressUI() {
        const total = this.sentenceList.filter(s => s.status !== 'skipped').length;
        const processed = this.sentenceList.filter(s => s.status === 'done' || s.status === 'failed' || s.status === 'identical').length;
        
        const badge = document.getElementById('sr-progress-badge');
        if (badge) badge.textContent = `${processed} / ${total} done`;

        const summary = document.getElementById('sr-status-summary');
        if (summary) {
            if (this.isQueueRunning) {
                summary.textContent = `Processing sentence ${Math.min(processed + 1, total)}...`;
            } else if (this.isQueueAborted) {
                summary.textContent = 'Queue paused / stopped';
            } else if (processed === total) {
                summary.textContent = 'Rewrite complete. Review and apply changes.';
            } else {
                summary.textContent = 'Ready';
            }
        }
    }

    async startQueue() {
        this.isQueueRunning = true;
        this.isQueueAborted = false;
        document.getElementById('btn-sr-stop').disabled = false;

        for (let i = 0; i < this.sentenceList.length; i++) {
            if (this.isQueueAborted) break;

            const item = this.sentenceList[i];
            if (item.status !== 'pending') continue;

            // Update to processing
            item.status = 'processing';
            this.updateRowUI(item, i);
            this.updateProgressUI();

            // Yield to DOM update
            await new Promise(r => setTimeout(r, 20));

            try {
                const outputText = await this.engine.rewrite(item.core);
                const trimmedOutput = outputText.trim();
                item.rewritten = item.prefix + trimmedOutput + item.suffix;
                
                if (trimmedOutput === item.core) {
                    item.status = 'identical';
                    item.useRewritten = false; // Same either way, safe fallback
                } else {
                    item.status = 'done';
                    item.useRewritten = true;
                }
            } catch (err) {
                console.error(`Error rewriting sentence #${i + 1}:`, err);
                item.status = 'failed';
                item.rewritten = item.original;
                item.useRewritten = false;
            }

            this.updateRowUI(item, i);
            this.updateProgressUI();
        }

        this.isQueueRunning = false;
        document.getElementById('btn-sr-stop').disabled = true;
        this.updateProgressUI();
    }

    stopQueue() {
        this.isQueueAborted = true;
        this.isQueueRunning = false;
        document.getElementById('btn-sr-stop').disabled = true;
        this.updateProgressUI();
    }

    cancelStagedRewrite() {
        this.stopQueue();
        document.getElementById('staged-rewrite-modal').classList.add('hidden');
        this.sentenceList = [];
        this.stagedMsgIndex = null;
    }

    toggleSentence(index) {
        const item = this.sentenceList[index];
        if (item.status !== 'done') return;

        item.useRewritten = !item.useRewritten;
        this.updateRowUI(item, index);
    }

    updateRowUI(item, index) {
        const card = document.getElementById(`sr-row-${item.id}`);
        const badge = document.getElementById(`sr-badge-${item.id}`);
        const content = document.getElementById(`sr-content-${item.id}`);
        if (!card || !badge || !content) return;

        card.className = `sr-card ${item.status === 'processing' ? 'processing' : ''} ${item.status === 'skipped' ? 'skipped' : ''}`;
        badge.className = `sr-badge sr-badge-${item.status}`;

        if (item.status === 'pending') {
            badge.textContent = 'Pending';
            content.textContent = item.core;
        } else if (item.status === 'processing') {
            badge.textContent = 'Pruning...';
            content.textContent = item.core;
        } else if (item.status === 'failed') {
            badge.textContent = 'Failed';
            content.textContent = item.core;
        } else if (item.status === 'skipped') {
            badge.textContent = 'Skipped';
            content.textContent = '(whitespace)';
        } else if (item.status === 'identical') {
            badge.textContent = 'Identical';
            badge.className = 'sr-badge sr-badge-identical';
            content.textContent = item.original;
        } else if (item.status === 'done') {
            if (item.useRewritten) {
                badge.textContent = 'Rewritten';
                badge.className = 'sr-badge sr-badge-rewritten';
                const diff = diffWords(item.original, item.rewritten);
                content.innerHTML = diff.newHtml;
            } else {
                badge.textContent = 'Original';
                badge.className = 'sr-badge sr-badge-original';
                content.textContent = item.original;
            }
        }
    }

    // Phase 5: Zero-Drift Document Reconstruction via Character Offsets
    assembleDocument(originalFullText, sentenceList) {
        let result = '';
        let cursor = 0;

        for (const item of sentenceList) {
            // 1. Copy any unmanaged text/spacing up to this sentence's index
            result += originalFullText.slice(cursor, item.index);

            // 2. Insert chosen rewritten or original text
            result += (item.useRewritten && item.status === 'done' ? item.rewritten : item.original);

            // 3. Advance cursor past original segment
            cursor = item.index + item.original.length;
        }

        // 4. Append remaining text after last sentence
        result += originalFullText.slice(cursor);
        return result;
    }

    applyStagedRewrite() {
        this.stopQueue();

        if (this.stagedMsgIndex === null || !this.app.state.history[this.stagedMsgIndex]) {
            this.cancelStagedRewrite();
            return;
        }

        const reconstructed = this.assembleDocument(this.stagedOriginalText, this.sentenceList);
        
        // Update turn in state (skipping edit logging as requested)
        this.app.state.editTurn(this.stagedMsgIndex, reconstructed);

        document.getElementById('staged-rewrite-modal').classList.add('hidden');
        this.sentenceList = [];
        this.stagedMsgIndex = null;

        this.app.renderAll();
        this.app.autoSave();
    }
}