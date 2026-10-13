import { settings } from '../state/AppSettings.js';

export class FlagCollectorManager {
    constructor(app) {
        this.app = app;
        this.injectHTML();
        this.bindEvents();
    }

    injectHTML() {
        const modal = document.createElement('div');
        modal.id = 'flag-collector-modal';
        modal.className = 'modal hidden';
        modal.style.padding = '0'; // Full bleed style

        modal.innerHTML = `
            <div class="modal-content" style="width: 100vw; height: 100vh; height: 100dvh; max-width: none; max-height: none; border-radius: 0; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h2>Collect Flags</h2>
                    <div style="display:flex; gap: 8px;">
                        <button id="btn-fc-apply" class="primary">✅ Apply Selected</button>
                        <button id="btn-fc-close" class="close-btn">&times;</button>
                    </div>
                </div>
                <div class="modal-body" style="flex:1; padding: 0; overflow:hidden; display:flex; flex-direction:column;">
                    <div style="padding: 12px; background: var(--bg-main); border-bottom: 1px solid var(--border); font-size: 0.9em; color: var(--text-muted);">
                        <span id="fc-stats-header">Found 0 unique flags across 0 drafts.</span>
                    </div>
                    <div style="flex:1; overflow-y:auto; padding: 12px;">
                        <table class="fc-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px; text-align:center;">Keep</th>
                                    <th>Flag Details</th>
                                </tr>
                            </thead>
                            <tbody id="fc-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    bindEvents() {
        document.getElementById('btn-fc-close').addEventListener('click', () => this.close());
        document.getElementById('btn-fc-apply').addEventListener('click', () => this.apply());
    }

    open() {
        if (this.app.state.history.length === 0) return alert("No messages available.");
        const targetIdx = this.app.state.history.length - 1;
        const lastMsg = this.app.state.history[targetIdx];

        if (lastMsg.role !== 'assistant') return alert("Last message must be an assistant response containing <flag> tags.");

        const draftsToScan = lastMsg.isBatch ? lastMsg.drafts : [lastMsg.drafts[lastMsg.activeDraftIndex]];
        const flagMap = new Map(); // key: normalized sentence

        const regex = /<flag>\s*<sentence>([\s\S]*?)<\/sentence>\s*<tag>([\s\S]*?)<\/tag>\s*<note>([\s\S]*?)<\/note>\s*<\/flag>/gi;

        let totalFlagsFound = 0;

        draftsToScan.forEach((draft, idx) => {
            if (!draft.content) return;
            const modelName = draft.model ? draft.model.split('/').pop() : `Draft ${idx + 1}`;
            
            let match;
            while ((match = regex.exec(draft.content)) !== null) {
                totalFlagsFound++;
                const sentence = match[1].trim();
                const tag = match[2].trim();
                const note = match[3].trim();
                
                const key = sentence.toLowerCase().replace(/\s+/g, ' '); // Normalize for deduplication

                if (!flagMap.has(key)) {
                    flagMap.set(key, {
                        originalSentence: sentence,
                        models: new Set(),
                        tagsAndNotes: [],
                        storyIndex: -1 // Will calculate next
                    });
                }
                
                const entry = flagMap.get(key);
                entry.models.add(modelName);
                
                // Add unique Tag + Note combo
                const combined = `[${tag}] ${note}`;
                if (!entry.tagsAndNotes.includes(combined)) {
                    entry.tagsAndNotes.push(combined);
                }
            }
        });

        if (flagMap.size === 0) return alert("No <flag> tags found in the latest message/drafts.");

        // Calculate Story Indices (Look back 7 messages)
        const scanHistory = this.app.state.history.slice(-8, -1); // Exclude the very last assistant message which has the flags
        const startIndexOffset = Math.max(0, this.app.state.history.length - 8);

        flagMap.forEach((entry, key) => {
            entry.storyIndex = 99999999; // Default to bottom
            for (let i = scanHistory.length - 1; i >= 0; i--) {
                const content = this.app.state.getContent(startIndexOffset + i);
                const searchIdx = content.toLowerCase().replace(/\s+/g, ' ').indexOf(key);
                if (searchIdx !== -1) {
                    entry.storyIndex = i * 100000 + searchIdx;
                    break;
                }
            }
        });

        // Convert to array and sort
        this.activeFlags = Array.from(flagMap.values());
        this.activeFlags.sort((a, b) => a.storyIndex - b.storyIndex);
        this.targetMessageIndex = targetIdx;

        this.renderList(totalFlagsFound, draftsToScan.length);
        document.getElementById('flag-collector-modal').classList.remove('hidden');
    }

    renderList(totalFlagsFound, totalDrafts) {
        document.getElementById('fc-stats-header').textContent = `Found ${this.activeFlags.length} unique flagged sentences across ${totalDrafts} drafts (from ${totalFlagsFound} total <flag> blocks).`;
        
        const tbody = document.getElementById('fc-tbody');
        tbody.innerHTML = '';

        this.activeFlags.forEach((flag, index) => {
            flag.id = index;
            const tr = document.createElement('tr');
            
            const isFound = flag.storyIndex !== 99999999;
            if (!isFound) tr.classList.add('fc-row-unfound');

            // Default check if flagged by >= 2 models
            const shouldCheck = flag.models.size >= 2;

            const modelsString = Array.from(flag.models).join(', ');
            const tagsNotesString = flag.tagsAndNotes.join('\n');

            let warningHtml = !isFound ? `<div style="color:var(--danger); font-size: 0.85em; font-weight:bold; margin-bottom:6px;">⚠️ Not found in recent context</div>` : '';

            tr.innerHTML = `
                <td style="text-align:center; padding-top: 12px;">
                    <input type="checkbox" class="fc-checkbox" data-id="${index}" ${shouldCheck ? 'checked' : ''}>
                </td>
                <td style="white-space: pre-wrap; padding: 12px 8px;">
                    <div style="margin-bottom: 8px; font-weight: 500; line-height: 1.4;">${flag.originalSentence.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    ${warningHtml}
                    <div class="fc-models" style="margin-bottom: 2px;">${modelsString}</div>
                    <div style="color: var(--text-main); font-size: 0.9em; opacity: 0.85;">${tagsNotesString.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </td>
            `;

            // Click row to toggle checkbox
            tr.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = tr.querySelector('.fc-checkbox');
                    cb.checked = !cb.checked;
                }
            });

            tbody.appendChild(tr);
        });
    }

    apply() {
        const checkboxes = Array.from(document.querySelectorAll('.fc-checkbox:checked'));
        if (checkboxes.length === 0) return alert("Select at least one flag to apply.");

        let outputChunks = [];
        checkboxes.forEach(cb => {
            const flag = this.activeFlags[parseInt(cb.dataset.id)];
            // We just grab the first tag and note to output back into valid XML
            const firstTagNote = flag.tagsAndNotes[0] || "[GENERIC] No note";
            const match = firstTagNote.match(/^\[(.*?)\]\s*(.*)$/);
            const tagStr = match ? match[1] : "GENERIC";
            const noteStr = match ? match[2] : firstTagNote;

            outputChunks.push(`<flag>\n<sentence>${flag.originalSentence}</sentence>\n<tag>${tagStr}</tag>\n<note>${noteStr}</note>\n</flag>`);
        });

        const fullText = outputChunks.join('\n\n');

        const msg = this.app.state.history[this.targetMessageIndex];
        
        msg.drafts.push({
            model: 'Flag Collector',
            content: fullText,
            reasoning: 'Collected and deduplicated from parallel drafts.',
            status: 'done',
            duration: 0,
            markdownOverride: null,
            usage: null,
            isStale: false
        });

        // Set the active draft to this new one
        this.app.state.setActiveDraft(this.targetMessageIndex, msg.drafts.length - 1);
        
        this.close();
        this.app.renderAll();
        this.app.autoSave();
    }

    close() {
        document.getElementById('flag-collector-modal').classList.add('hidden');
    }
}