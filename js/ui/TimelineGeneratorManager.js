// BEGIN FILE: js/ui/TimelineGeneratorManager.js
import { settings } from '../state/AppSettings.js';
import { GenerationJob } from '../api/OpenAIClient.js';

export class TimelineGeneratorManager {
    constructor(app) {
        this.app = app;
        this.historyIndex = -1;
        this.abortController = null;
        this.activeJob = null;
        this.parsedMarkers = [];
        this.bindEvents();
    }

    bindEvents() {
        // Tools Pane Buttons
        document.getElementById('btn-tg-edit-prompt').addEventListener('click', () => this.openPromptEditor());
        document.getElementById('btn-tg-range-all').addEventListener('click', () => {
            document.getElementById('tg-start-idx').value = 1;
            document.getElementById('tg-end-idx').value = this.app.state.history.length;
        });
        document.getElementById('btn-tg-range-unprocessed').addEventListener('click', () => {
            let lastMarkerMsg = 0;
            for (let i = this.app.state.history.length - 1; i >= 0; i--) {
                if (this.app.state.history[i].markers && this.app.state.history[i].markers.length > 0) {
                    lastMarkerMsg = i;
                    break;
                }
            }
            // Start from the message after the last mark (1-based index)
            document.getElementById('tg-start-idx').value = Math.min(this.app.state.history.length, lastMarkerMsg + 2);
            document.getElementById('tg-end-idx').value = this.app.state.history.length;
        });
        document.getElementById('btn-tg-generate').addEventListener('click', () => this.startGeneration());

        // Prompt Editor Modals
        document.getElementById('btn-close-tg-prompt').addEventListener('click', () => this.closePromptEditor());
        document.getElementById('btn-tg-prompt-cancel').addEventListener('click', () => this.closePromptEditor());
        document.getElementById('btn-tg-prompt-default').addEventListener('click', () => {
            document.getElementById('tg-prompt-textarea').value += "\n\n" + this.getDefaultPrompt();
        });
        document.getElementById('btn-tg-prompt-prev').addEventListener('click', () => this.cycleHistory(1));
        document.getElementById('btn-tg-prompt-next').addEventListener('click', () => this.cycleHistory(-1));
        document.getElementById('btn-tg-prompt-save').addEventListener('click', () => this.savePrompt());

        // Run / Review Modals
        document.getElementById('btn-tg-tab-stream').addEventListener('click', () => this.switchTab('stream'));
        document.getElementById('btn-tg-tab-review').addEventListener('click', () => this.switchTab('review'));
        document.getElementById('btn-tg-abort').addEventListener('click', () => this.abortGeneration());
        document.getElementById('btn-tg-run-cancel').addEventListener('click', () => this.closeRunModal());
        document.getElementById('btn-tg-run-apply').addEventListener('click', () => this.applySelectedMarkers());
    }

    getDefaultPrompt() {
        return "Analyze the following story chunks and identify key narrative events.\nOutput your findings as XML tags.\n- msg: the message number where it occurs\n- type: \"point\", \"interval_start\", or \"interval_end\"\n- id: (only for intervals) a unique string linking start and end (no spaces)\n- tags: comma-separated list of tags\n\nExample:\n<marker msg=\"14\" type=\"interval_start\" id=\"club_mtg\" tags=\"school, club\">Club Meeting</marker>\n<marker msg=\"15\" type=\"point\" tags=\"chris, purchase\">Chris Buys A Car</marker>\n<marker msg=\"22\" type=\"interval_end\" id=\"club_mtg\">Club Meeting</marker>";
    }

    populateUI() {
        document.getElementById('tg-start-idx').max = this.app.state.history.length || 1;
        document.getElementById('tg-end-idx').max = this.app.state.history.length || 1;
        document.getElementById('tg-end-idx').value = this.app.state.history.length || 1;
        document.getElementById('tg-chunk-size').value = settings.timelineChunkSize;
        document.getElementById('tg-overlap-size').value = settings.timelineOverlap;
    }

    // --- PROMPT EDITOR ---

    openPromptEditor() {
        document.getElementById('tg-prompt-textarea').value = settings.timelinePrompt;
        this.historyIndex = -1;
        this.updateHistoryLabel();
        document.getElementById('tg-prompt-modal').classList.remove('hidden');
    }

    closePromptEditor() {
        document.getElementById('tg-prompt-modal').classList.add('hidden');
    }

    savePrompt() {
        const val = document.getElementById('tg-prompt-textarea').value.trim();
        if (val && val !== settings.timelinePrompt) {
            settings.timelinePromptHistory.unshift(settings.timelinePrompt);
            if (settings.timelinePromptHistory.length > 5) settings.timelinePromptHistory.length = 5;
            settings.timelinePrompt = val;
            settings.save();
        }
        this.closePromptEditor();
    }

    cycleHistory(dir) {
        if (settings.timelinePromptHistory.length === 0) return;
        this.historyIndex += dir;
        
        if (this.historyIndex < -1) this.historyIndex = -1;
        if (this.historyIndex >= settings.timelinePromptHistory.length) {
            this.historyIndex = settings.timelinePromptHistory.length - 1;
        }

        if (this.historyIndex === -1) {
            document.getElementById('tg-prompt-textarea').value = settings.timelinePrompt;
        } else {
            document.getElementById('tg-prompt-textarea').value = settings.timelinePromptHistory[this.historyIndex];
        }
        this.updateHistoryLabel();
    }

    updateHistoryLabel() {
        const max = settings.timelinePromptHistory.length;
        const lbl = document.getElementById('tg-prompt-history-lbl');
        if (this.historyIndex === -1) {
            lbl.textContent = `Current (0/${max})`;
        } else {
            lbl.textContent = `History (${this.historyIndex + 1}/${max})`;
        }
    }

    // --- GENERATION ENGINE ---

    switchTab(tab) {
        if (tab === 'stream') {
            document.getElementById('btn-tg-tab-stream').classList.add('primary');
            document.getElementById('btn-tg-tab-review').classList.remove('primary');
            document.getElementById('tg-run-stream').classList.remove('hidden');
            document.getElementById('tg-run-review').classList.add('hidden');
        } else {
            document.getElementById('btn-tg-tab-stream').classList.remove('primary');
            document.getElementById('btn-tg-tab-review').classList.add('primary');
            document.getElementById('tg-run-stream').classList.add('hidden');
            document.getElementById('tg-run-review').classList.remove('hidden');
        }
    }

    closeRunModal() {
        document.getElementById('tg-run-modal').classList.add('hidden');
        if (this.abortController) this.abortController.abort();
    }

    abortGeneration() {
        if (this.activeJob) {
            this.activeJob.cancel();
            document.getElementById('tg-run-status').textContent = "Generation Aborted.";
            this.finishGeneration();
        }
    }

    async startGeneration() {
        // 1. Gather config
        const startIdx = parseInt(document.getElementById('tg-start-idx').value) - 1; // 0-based
        const endIdx = parseInt(document.getElementById('tg-end-idx').value) - 1; // 0-based
        const chunkSize = parseInt(document.getElementById('tg-chunk-size').value);
        const overlap = parseInt(document.getElementById('tg-overlap-size').value);
        
        settings.timelineChunkSize = chunkSize;
        settings.timelineOverlap = overlap;
        settings.save();

        if (startIdx < 0 || endIdx >= this.app.state.history.length || startIdx > endIdx) {
            return alert("Invalid range selected.");
        }

        // 2. Prep UI
        document.getElementById('tools-modal').classList.add('hidden');
        document.getElementById('tg-run-modal').classList.remove('hidden');
        
        this.switchTab('stream');
        document.getElementById('tg-run-stream').value = '';
        document.getElementById('tg-run-review').innerHTML = '';
        document.getElementById('tg-progress-lbl').textContent = '0%';
        document.getElementById('btn-tg-abort').classList.remove('hidden');
        document.getElementById('btn-tg-run-cancel').classList.add('hidden');
        document.getElementById('btn-tg-run-apply').classList.add('hidden');

        this.parsedMarkers = [];
        this.abortController = new AbortController();

        // 3. Scan for existing open intervals prior to the startIdx
        const openIntervals = {};
        for (let i = 0; i < startIdx; i++) {
            const msg = this.app.state.history[i];
            if (!msg.markers) continue;
            msg.markers.forEach(mk => {
                if (mk.type === 'interval_start') {
                    openIntervals[mk.intervalId] = { ...mk, msgIndex: i };
                } else if (mk.type === 'interval_end') {
                    delete openIntervals[mk.intervalId];
                }
            });
        }

        // 4. Chunking Loop
        let currentStart = startIdx;
        const totalMessages = endIdx - startIdx + 1;
        let messagesProcessed = 0;

        try {
            while (currentStart <= endIdx) {
                if (this.abortController.signal.aborted) break;

                const currentEnd = Math.min(endIdx, currentStart + chunkSize - 1);
                const prefixStart = Math.max(0, currentStart - overlap);
                
                // Build text payload
                let payloadText = "";
                
                // Active Open Intervals Injector
                const openArr = Object.values(openIntervals);
                if (openArr.length > 0) {
                    payloadText += `<open_intervals>\nThese events are currently active and have not ended yet:\n`;
                    openArr.forEach(oi => {
                        payloadText += `- "${oi.name}" (id: ${oi.intervalId}) started at msg ${oi.msgIndex + 1}\n`;
                    });
                    payloadText += `</open_intervals>\n\n`;
                }

                // Prior Context (Overlap)
                if (prefixStart < currentStart) {
                    payloadText += `<prior_context_do_not_tag>\n`;
                    for (let i = prefixStart; i < currentStart; i++) {
                        payloadText += `<message num="${i+1}">\n${this.app.state.getContent(i)}\n</message>\n\n`;
                    }
                    payloadText += `</prior_context_do_not_tag>\n\n`;
                }

                // Target Chunk
                payloadText += `<messages_to_tag>\n`;
                for (let i = currentStart; i <= currentEnd; i++) {
                    payloadText += `<message num="${i+1}">\n${this.app.state.getContent(i)}\n</message>\n\n`;
                }
                payloadText += `</messages_to_tag>`;

                const messages = [
                    { role: 'system', content: settings.timelinePrompt },
                    { role: 'user', content: payloadText }
                ];

                document.getElementById('tg-run-status').textContent = `Processing messages ${currentStart+1} to ${currentEnd+1}...`;
                document.getElementById('tg-run-stream').value += `\n\n--- CHUNK: Msgs ${currentStart+1} to ${currentEnd+1} ---\n`;

                this.activeJob = new GenerationJob();
                await this.activeJob.start(messages, () => {
                    document.getElementById('tg-run-stream').value = this.activeJob.rawContent;
                    this.parseStream(this.activeJob.finalContent); // Re-parse everything live
                });

                if (this.abortController.signal.aborted) break;

                // Final Parse for this chunk to finalize state and open intervals
                this.finalizeChunk(this.activeJob.finalContent, openIntervals, currentStart);

                messagesProcessed += (currentEnd - currentStart + 1);
                const pct = Math.round((messagesProcessed / totalMessages) * 100);
                document.getElementById('tg-progress-lbl').textContent = `${pct}%`;

                currentStart = currentEnd + 1;
            }
        } catch (e) {
            console.error("Timeline Generation Error:", e);
            document.getElementById('tg-run-status').textContent = `Error: ${e.message}`;
        }

        this.finishGeneration();
    }

    finishGeneration() {
        document.getElementById('btn-tg-abort').classList.add('hidden');
        document.getElementById('btn-tg-run-cancel').classList.remove('hidden');
        document.getElementById('btn-tg-run-apply').classList.remove('hidden');
        
        const count = this.parsedMarkers.length;
        document.getElementById('tg-run-status').textContent = `Finished. Found ${count} markers.`;
        if (count > 0 && document.getElementById('btn-tg-tab-stream').classList.contains('primary')) {
            this.switchTab('review'); // Auto-switch to review if markers exist
        }
    }

    // --- PARSING & REVIEW UI ---

    // Parses string live and renders to the Review pane immediately
    parseStream(text) {
        const regex = /<marker\s+([^>]+)>([\s\S]*?)<\/marker>/gi;
        const localMarkers = [];
        let match;

        while ((match = regex.exec(text)) !== null) {
            const attrStr = match[1];
            const name = match[2].trim();
            
            const msgMatch = attrStr.match(/msg="(\d+)"/i);
            const typeMatch = attrStr.match(/type="([^"]+)"/i);
            const idMatch = attrStr.match(/id="([^"]+)"/i);
            const tagsMatch = attrStr.match(/tags="([^"]+)"/i);

            if (msgMatch && typeMatch) {
                localMarkers.push({
                    name: name,
                    msgNum: parseInt(msgMatch[1]), // 1-based
                    type: typeMatch[1].toLowerCase(),
                    intervalId: idMatch ? idMatch[1] : null,
                    tags: tagsMatch ? tagsMatch[1].split(',').map(t=>t.trim()).filter(t=>t) : [],
                    selected: true,
                    uid: Math.random().toString(36).substr(2, 9)
                });
            }
        }

        // Just blindly overwrite the review pane with whatever is fully processed + live local chunk
        const fullDisplayList = [...this.parsedMarkers, ...localMarkers];
        this.renderReviewPane(fullDisplayList);
    }

    // Commits a chunk to the persistent list and tracks open interval states
    finalizeChunk(text, openIntervalsTracker, chunkStartIdx) {
        const regex = /<marker\s+([^>]+)>([\s\S]*?)<\/marker>/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const attrStr = match[1];
            const name = match[2].trim();
            const msgMatch = attrStr.match(/msg="(\d+)"/i);
            const typeMatch = attrStr.match(/type="([^"]+)"/i);
            const idMatch = attrStr.match(/id="([^"]+)"/i);
            const tagsMatch = attrStr.match(/tags="([^"]+)"/i);

            if (!msgMatch || !typeMatch) continue;

            const marker = {
                name: name,
                msgNum: parseInt(msgMatch[1]), 
                type: typeMatch[1].toLowerCase(),
                intervalId: idMatch ? idMatch[1] : null,
                tags: tagsMatch ? tagsMatch[1].split(',').map(t=>t.trim()).filter(t=>t) : [],
                selected: true,
                uid: Math.random().toString(36).substr(2, 9)
            };

            // Namespace the ID to prevent global hallucination collisions across disparate chunks,
            // unless it's closing an interval we specifically know is open.
            if (marker.intervalId) {
                if (marker.type === 'interval_end' && openIntervalsTracker[marker.intervalId]) {
                    // Valid close, keep ID intact so they link
                    delete openIntervalsTracker[marker.intervalId];
                } else if (marker.type === 'interval_start') {
                    // Namespace it to this chunk just in case
                    marker.intervalId = `c${chunkStartIdx}_${marker.intervalId}`;
                    openIntervalsTracker[marker.intervalId] = marker;
                }
            }

            this.parsedMarkers.push(marker);
        }
    }

    renderReviewPane(displayList) {
        const container = document.getElementById('tg-run-review');
        container.innerHTML = '';
        
        displayList.forEach(mk => {
            const card = document.createElement('div');
            card.className = 'tg-marker-card';
            if (!mk.selected) card.classList.add('unselected');
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'tg-marker-checkbox';
            cb.checked = mk.selected;

            cb.addEventListener('change', (e) => {
                mk.selected = e.target.checked;
                if (mk.selected) card.classList.remove('unselected');
                else card.classList.add('unselected');
                
                // Pairing logic for intervals
                if (mk.intervalId) {
                    displayList.forEach(otherMk => {
                        if (otherMk.intervalId === mk.intervalId && otherMk !== mk) {
                            otherMk.selected = mk.selected;
                        }
                    });
                    this.renderReviewPane(displayList); // Re-render to show paired unchecks
                }
            });

            const info = document.createElement('div');
            info.className = 'tg-marker-info';
            
            let icon = '📍';
            let color = '#60a5fa';
            if (mk.type === 'interval_start') { icon = '▶'; color = '#4ade80'; }
            if (mk.type === 'interval_end') { icon = '⏹'; color = '#fb923c'; }
            
            info.innerHTML = `
                <div style="font-weight:bold; color:${color}; margin-bottom:4px;">${icon} ${mk.name}</div>
                <div style="font-size:0.85em; color:var(--text-muted);">Turn #${mk.msgNum}</div>
            `;
            if (mk.tags.length > 0) {
                info.innerHTML += `<div style="font-size:0.8em; margin-top:4px; opacity:0.8;">Tags: ${mk.tags.join(', ')}</div>`;
            }

            card.addEventListener('click', (e) => {
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            });

            card.appendChild(cb);
            card.appendChild(info);
            container.appendChild(card);
        });
    }

    applySelectedMarkers() {
        const toApply = this.parsedMarkers.filter(m => m.selected);
        let appliedCount = 0;

        toApply.forEach(mk => {
            const arrIndex = mk.msgNum - 1; // absolute 1-based back to 0-based history index
            if (arrIndex >= 0 && arrIndex < this.app.state.history.length) {
                const msg = this.app.state.history[arrIndex];
                if (!msg.markers) msg.markers = [];
                
                // Add the cleaned marker
                msg.markers.push({
                    id: Math.random().toString(36).substr(2, 9),
                    type: mk.type,
                    name: mk.name,
                    tags: mk.tags,
                    intervalId: mk.intervalId
                });
                appliedCount++;
            }
        });

        this.app.renderAll();
        this.app.autoSave();
        
        alert(`Successfully applied ${appliedCount} timeline markers.`);
        this.closeRunModal();
    }
}
// END FILE: js/ui/TimelineGeneratorManager.js