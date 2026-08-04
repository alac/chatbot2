import { diffLines } from '../utils/diff.js';

export class MemoryHistoryManager {
    constructor(app) {
        this.app = app;
        this.currentIndex = 0;
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-open-memory-history').addEventListener('click', () => this.open());
        document.getElementById('btn-close-memory-history').addEventListener('click', () => this.close());
        document.getElementById('btn-mh-prev').addEventListener('click', () => this.navigate(1)); // Older is a higher index
        document.getElementById('btn-mh-next').addEventListener('click', () => this.navigate(-1));
        document.getElementById('btn-mh-restore').addEventListener('click', () => this.restore());
    }

    open() {
        const history = this.app.state.systemPromptHistory;
        if (!history || history.length === 0) {
            alert("No memory history available.");
            return;
        }
        this.currentIndex = 0; // Index 0 is the most recent historical item
        this.render();
        document.getElementById('memory-history-modal').classList.remove('hidden');
    }

    close() {
        document.getElementById('memory-history-modal').classList.add('hidden');
    }

    navigate(dir) {
        const history = this.app.state.systemPromptHistory;
        const newIndex = this.currentIndex + dir;
        if (newIndex >= 0 && newIndex < history.length) {
            this.currentIndex = newIndex;
            this.render();
        }
    }

    render() {
        const history = this.app.state.systemPromptHistory;
        const record = history[this.currentIndex];
        const currentMemory = document.getElementById('set-system-prompt').value; // Check live unsaved UI text

        // Update Labels
        const dateObj = new Date(record.timestamp);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('mh-version-label').innerHTML = `Version ${this.currentIndex + 1} of ${history.length}<br><span style="font-weight:normal; color:var(--text-muted); font-size: 0.85em;">${dateStr}</span>`;

        // Manage button disabled states
        document.getElementById('btn-mh-prev').disabled = this.currentIndex === history.length - 1;
        document.getElementById('btn-mh-next').disabled = this.currentIndex === 0;

        // Render Side-by-side Diff
        const diffs = this.generateDiffHtml(record.text, currentMemory);
        const container = document.getElementById('mh-diff-container');
        container.innerHTML = `
            <div class="mh-diff-col left">${diffs.leftHtml}</div>
            <div class="mh-diff-col right">${diffs.rightHtml}</div>
        `;
    }

    restore() {
        if (confirm("Are you sure you want to replace the current Memory with this historical version?\n\nThis will instantly overwrite the text box in the settings menu.")) {
            const history = this.app.state.systemPromptHistory;
            const record = history[this.currentIndex];
            document.getElementById('set-system-prompt').value = record.text;
            this.close();
        }
    }

    generateDiffHtml(oldText, newText) {
        const diffs = diffLines(oldText, newText);
        let rows = [];
        let i = 0;

        // Group changes into perfectly aligned left/right row blocks
        while (i < diffs.length) {
            if (diffs[i].type === 'equal') {
                const safeVal = diffs[i].value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                rows.push({ left: { text: safeVal, type: 'equal' }, right: { text: safeVal, type: 'equal' }, changed: false });
                i++;
            } else {
                let deletes = [];
                let inserts = [];
                while (i < diffs.length && diffs[i].type !== 'equal') {
                    if (diffs[i].type === 'delete') deletes.push(diffs[i].value.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
                    if (diffs[i].type === 'insert') inserts.push(diffs[i].value.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
                    i++;
                }
                const maxLen = Math.max(deletes.length, inserts.length);
                for (let j = 0; j < maxLen; j++) {
                    rows.push({
                        left: j < deletes.length ? { text: deletes[j], type: 'delete' } : { text: '', type: 'empty' },
                        right: j < inserts.length ? { text: inserts[j], type: 'insert' } : { text: '', type: 'empty' },
                        changed: true
                    });
                }
            }
        }

        // Compute Visibility Context (Show N lines before and after edits)
        const CONTEXT_LINES = 2;
        let showRow = new Array(rows.length).fill(false);
        for (let r = 0; r < rows.length; r++) {
            if (rows[r].changed) {
                for (let c = Math.max(0, r - CONTEXT_LINES); c <= Math.min(rows.length - 1, r + CONTEXT_LINES); c++) {
                    showRow[c] = true;
                }
            }
        }

        // Render to HTML
        let leftHtml = '';
        let rightHtml = '';
        let wasHidden = false;

        for (let r = 0; r < rows.length; r++) {
            if (!showRow[r]) {
                if (!wasHidden && r > 0) {
                    leftHtml += `<div class="mh-diff-chunk-separator">[...]</div>`;
                    rightHtml += `<div class="mh-diff-chunk-separator">[...]</div>`;
                }
                wasHidden = true;
                continue;
            }
            wasHidden = false;

            const row = rows[r];
            const formatLine = (cell) => {
                if (cell.type === 'empty') return `<div class="mh-line"></div>`;
                if (cell.type === 'delete') return `<div class="mh-line del">${cell.text || ' '}</div>`;
                if (cell.type === 'insert') return `<div class="mh-line ins">${cell.text || ' '}</div>`;
                return `<div class="mh-line">${cell.text || ' '}</div>`;
            };

            leftHtml += formatLine(row.left);
            rightHtml += formatLine(row.right);
        }

        if (wasHidden && rows.length > 0) {
            leftHtml += `<div class="mh-diff-chunk-separator">[...]</div>`;
            rightHtml += `<div class="mh-diff-chunk-separator">[...]</div>`;
        }

        if (!rows.some(r => r.changed)) {
            leftHtml = `<div style="padding: 10px; color: var(--text-muted); text-align: center;">No differences found.</div>`;
            rightHtml = `<div style="padding: 10px; color: var(--text-muted); text-align: center;">No differences found.</div>`;
        }

        return { leftHtml, rightHtml };
    }
}