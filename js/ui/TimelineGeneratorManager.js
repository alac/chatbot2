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
        this.closedIntervalNames = new Set();
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
            let lastMarkerMsg = -1;
            for (let i = this.app.state.history.length - 1; i >= 0; i--) {
                if (this.app.state.history[i].markers && this.app.state.history[i].markers.length > 0) {
                    lastMarkerMsg = i;
                    break;
                }
            }
            const startVal = lastMarkerMsg === -1 ? 1 : Math.min(this.app.state.history.length, lastMarkerMsg + 2);
            document.getElementById('tg-start-idx').value = startVal;
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

    // Normalizes event names for fuzzy matching (stripping "ends", "end of", etc.)
    normalizeEventName(name) {
        if (!name) return "";
        return name
            .toLowerCase()
            .replace(/^(end\s+of|the\s+end\s+of)\s+/i, '')
            .replace(/\s+(ends|concludes|finishes|adjourns|over)$/i, '')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
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

        const eligibleTurns = [];
        for (let i = 0; i < this.app.state.history.length; i++) {
            const turn = this.app.state.history[i];
            if (turn.isHidden || turn.role === 'gallery' || turn.role === 'choices') continue;
            eligibleTurns.push({
                index: i,
                turnNum: i + 1,
                content: this.app.state.getContent(i)
            });
        }

        const targetTurns = eligibleTurns.filter(t => t.index >= startIdx && t.index <= endIdx);
        const totalTarget = targetTurns.length;

        if (totalTarget === 0) {
            return alert("No visible narrative messages found in the selected range.");
        }

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
        this.closedIntervalNames.clear();
        this.abortController = new AbortController();

        // Scan for existing open intervals prior to startIdx
        const openIntervals = {};
        for (let i = 0; i < startIdx; i++) {
            const msg = this.app.state.history[i];
            if (!msg.markers) continue;
            msg.markers.forEach(mk => {
                if (mk.type === 'interval_start') {
                    openIntervals[mk.intervalId] = { ...mk, msgIndex: i };
                } else if (mk.type === 'interval_end' && mk.intervalId) {
                    delete openIntervals[mk.intervalId];
                    this.closedIntervalNames.add(this.normalizeEventName(mk.name));
                }
            });
        }

        let accumulatedStream = "";
        let turnCursor = 0;

        try {
            while (turnCursor < totalTarget) {
                if (this.abortController.signal.aborted) break;

                const chunkEndCursor = Math.min(totalTarget, turnCursor + chunkSize);
                const chunkTurns = targetTurns.slice(turnCursor, chunkEndCursor);

                let overlapTurns = [];
                if (overlap > 0) {
                    const firstChunkTurnIndex = chunkTurns[0].index;
                    overlapTurns = eligibleTurns
                        .filter(t => t.index < firstChunkTurnIndex)
                        .slice(-overlap);
                }

                let payloadText = "";
                
                const openArr = Object.values(openIntervals);
                if (openArr.length > 0) {
                    payloadText += `<open_intervals>\nThese events are currently active and have not ended yet:\n`;
                    openArr.forEach(oi => {
                        payloadText += `- "${oi.name}" (id: ${oi.intervalId}) started at msg ${oi.msgIndex + 1}\n`;
                    });
                    payloadText += `</open_intervals>\n\n`;
                }

                if (overlapTurns.length > 0) {
                    payloadText += `<prior_context_do_not_tag>\n`;
                    overlapTurns.forEach(t => {
                        payloadText += `<message num="${t.turnNum}">\n${t.content}\n</message>\n\n`;
                    });
                    payloadText += `</prior_context_do_not_tag>\n\n`;
                }

                payloadText += `<messages_to_tag>\n`;
                chunkTurns.forEach(t => {
                    payloadText += `<message num="${t.turnNum}">\n${t.content}\n</message>\n\n`;
                });
                payloadText += `</messages_to_tag>`;

                const messages = [
                    { role: 'system', content: settings.timelinePrompt },
                    { role: 'user', content: payloadText }
                ];

                const chunkHeader = `\n--- CHUNK: Turns #${chunkTurns[0].turnNum} to #${chunkTurns[chunkTurns.length - 1].turnNum} ---\n`;
                document.getElementById('tg-run-status').textContent = `Processing turns #${chunkTurns[0].turnNum} to #${chunkTurns[chunkTurns.length - 1].turnNum}...`;

                const streamEl = document.getElementById('tg-run-stream');
                this.activeJob = new GenerationJob();

                await this.activeJob.start(messages, () => {
                    // Buffer 1: Display with reasoning
                    let displayChunk = "";
                    if (this.activeJob.finalReasoning) {
                        displayChunk += `<think>\n${this.activeJob.finalReasoning}\n</think>\n\n`;
                    }
                    displayChunk += this.activeJob.finalContent;

                    streamEl.value = accumulatedStream + chunkHeader + displayChunk;
                    streamEl.scrollTop = streamEl.scrollHeight;

                    // Buffer 2: Output parser (clean text only)
                    this.parseStream(this.activeJob.finalContent, openIntervals);
                });

                if (this.abortController.signal.aborted) break;

                this.finalizeChunk(this.activeJob.finalContent, openIntervals, chunkTurns[0].turnNum);

                let finishedChunkDisplay = "";
                if (this.activeJob.finalReasoning) {
                    finishedChunkDisplay += `<think>\n${this.activeJob.finalReasoning}\n</think>\n\n`;
                }
                finishedChunkDisplay += this.activeJob.finalContent;
                accumulatedStream += chunkHeader + finishedChunkDisplay + "\n";

                turnCursor = chunkEndCursor;
                const pct = Math.round((turnCursor / totalTarget) * 100);
                document.getElementById('tg-progress-lbl').textContent = `${pct}%`;
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
        
        this.renderReviewPane(this.parsedMarkers, true);

        if (count > 0 && document.getElementById('btn-tg-tab-stream').classList.contains('primary')) {
            this.switchTab('review');
        }
    }

    // --- PARSING & REVIEW UI ---

    parseStream(text, openIntervals) {
        const cleanText = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
        const regex = /<marker\s+([^>]+)>([\s\S]*?)<\/marker>/gi;
        const localMarkers = [];
        let match;

        while ((match = regex.exec(cleanText)) !== null) {
            const attrStr = match[1];
            const name = match[2].trim();
            const msgMatch = attrStr.match(/msg="(\d+)"/i);
            const typeMatch = attrStr.match(/type="([^"]+)"/i);
            const idMatch = attrStr.match(/id="([^"]+)"/i);
            const tagsMatch = attrStr.match(/tags="([^"]+)"/i);

            if (msgMatch && typeMatch) {
                let mType = typeMatch[1].toLowerCase();
                let mId = idMatch ? idMatch[1] : null;

                // Live preview fuzzy ID linking
                if (mType === 'interval_end' && openIntervals) {
                    const norm = this.normalizeEventName(name);
                    for (let key in openIntervals) {
                        const oi = openIntervals[key];
                        if (key === mId || this.normalizeEventName(oi.name) === norm) {
                            mId = oi.intervalId;
                            break;
                        }
                    }
                }

                localMarkers.push({
                    name: name,
                    msgNum: parseInt(msgMatch[1]),
                    type: mType,
                    intervalId: mId,
                    tags: tagsMatch ? tagsMatch[1].split(',').map(t=>t.trim()).filter(t=>t) : [],
                    selected: true,
                    uid: Math.random().toString(36).substr(2, 9)
                });
            }
        }

        const fullDisplayList = [...this.parsedMarkers, ...localMarkers];
        this.renderReviewPane(fullDisplayList, false);
    }

    finalizeChunk(text, openIntervalsTracker, chunkStartIdx) {
        const cleanText = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
        const regex = /<marker\s+([^>]+)>([\s\S]*?)<\/marker>/gi;
        let match;

        while ((match = regex.exec(cleanText)) !== null) {
            const attrStr = match[1];
            let name = match[2].trim();
            const msgMatch = attrStr.match(/msg="(\d+)"/i);
            const typeMatch = attrStr.match(/type="([^"]+)"/i);
            const idMatch = attrStr.match(/id="([^"]+)"/i);
            const tagsMatch = attrStr.match(/tags="([^"]+)"/i);

            if (!msgMatch || !typeMatch) continue;

            const mType = typeMatch[1].toLowerCase();
            let mId = idMatch ? idMatch[1] : null;

            // --- FUZZY INTERVAL MATCHING & DUPLICATE RESOLUTION ---
            if (mType === 'interval_end') {
                const normName = this.normalizeEventName(name);
                let matchedOpen = null;

                // 1. Exact ID match
                if (mId && openIntervalsTracker[mId]) {
                    matchedOpen = openIntervalsTracker[mId];
                }

                // 2. Fallback: Fuzzy Name Match against open intervals
                if (!matchedOpen) {
                    for (const key in openIntervalsTracker) {
                        const oi = openIntervalsTracker[key];
                        const oiNorm = this.normalizeEventName(oi.name);
                        if (oiNorm === normName || oiNorm.includes(normName) || normName.includes(oiNorm)) {
                            matchedOpen = oi;
                            break;
                        }
                    }
                }

                if (matchedOpen) {
                    // Harmonize ID and Name to match the Start marker perfectly
                    mId = matchedOpen.intervalId;
                    name = matchedOpen.name;
                    delete openIntervalsTracker[matchedOpen.intervalId];
                    this.closedIntervalNames.add(normName);
                } else {
                    // Suppress duplicate: If this interval was already closed in an earlier chunk, skip it!
                    if (this.closedIntervalNames.has(normName)) {
                        continue;
                    }
                }
            } else if (mType === 'interval_start') {
                mId = `c${chunkStartIdx}_${mId || Math.random().toString(36).substr(2, 7)}`;
            }

            const marker = {
                name: name,
                msgNum: parseInt(msgMatch[1]), 
                type: mType,
                intervalId: mId,
                tags: tagsMatch ? tagsMatch[1].split(',').map(t=>t.trim()).filter(t=>t) : [],
                selected: true,
                uid: Math.random().toString(36).substr(2, 9)
            };

            if (marker.type === 'interval_start') {
                openIntervalsTracker[marker.intervalId] = marker;
            }

            this.parsedMarkers.push(marker);
        }
    }

    renderReviewPane(displayList, isInteractive = false) {
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
            cb.disabled = !isInteractive;

            cb.addEventListener('change', (e) => {
                mk.selected = e.target.checked;
                if (mk.selected) card.classList.remove('unselected');
                else card.classList.add('unselected');
                
                // Pair unselections for intervals
                if (mk.intervalId) {
                    displayList.forEach(otherMk => {
                        if (otherMk.intervalId === mk.intervalId && otherMk !== mk) {
                            otherMk.selected = mk.selected;
                        }
                    });
                    this.renderReviewPane(displayList, true);
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
                if (!isInteractive) return;
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
            const arrIndex = mk.msgNum - 1;
            if (arrIndex >= 0 && arrIndex < this.app.state.history.length) {
                const msg = this.app.state.history[arrIndex];
                if (!msg.markers) msg.markers = [];
                
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