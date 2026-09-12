import { settings } from '../state/AppSettings.js';

export class TextRenderer {
    static shouldUseMarkdown(content, draftOverride) {
        if (draftOverride !== undefined && draftOverride !== null) return draftOverride;
        return !/<(?:edit|old|new|reasoning)[>\s]/i.test(content) && settings.renderMarkdown;
    }

    static setNodeContent(node, content, draft, isWithinHighlightRange = false) {
        // 1. Global Visual Regexes
        let processed = settings.applyRegexes(content || '', 'visually');

        // 2. Slop Highlighting (Tools)
        if (isWithinHighlightRange && settings.highlightEnabled && settings.highlightList.trim()) {
            const lines = settings.highlightList.split('\n').filter(l => l.trim());
            lines.forEach(line => {
                try {
                    let r;
                    const match = line.trim().match(/^\/(.+)\/([a-z]*)$/i);
                    if (match) {
                        r = new RegExp(match[1], match[2].includes('g') ? match[2] : match[2] + 'g');
                    } else {
                        // Escape string to literal regex
                        const escaped = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        r = new RegExp(escaped, 'gi');
                    }
                    processed = processed.replace(r, (m) => `<mark style="background:${settings.highlightBg}; color:${settings.highlightFg};">${m}</mark>`);
                } catch(e) { }
            });
        }
        
        // 3. Stash raw HTML blocks to prevent markdown parser interference
        let htmlBlocks = [];
        processed = processed.replace(/<html>([\s\S]*?)<\/html>/gi, (m, inner) => {
            const clean = window.DOMPurify ? window.DOMPurify.sanitize(inner) : inner;
            htmlBlocks.push(clean);
            return `%%HTML_BLOCK_${htmlBlocks.length - 1}%%`;
        });

        processed = processed.replace(/<(\/?)([a-zA-Z][^>]*)>/g, '&lt;$1$2&gt;');

        // 4. Markdown Rendering
        if (TextRenderer.shouldUseMarkdown(processed, draft.markdownOverride)) {
            processed = marked.parse(processed);
            node.classList.add('markdown-body');
        } else {
            processed = processed.replace(/\n/g, '<br>');
            node.classList.remove('markdown-body');
        }

        // 5. Restore HTML Blocks
        htmlBlocks.forEach((block, i) => {
            processed = processed.replace(`%%HTML_BLOCK_${i}%%`, block);
        });

        node.innerHTML = processed;

        // 6. Inject Code Block Copy Buttons
        const preElements = node.querySelectorAll('pre');
        preElements.forEach(pre => {
            if (pre.parentElement.classList.contains('code-block-wrapper')) return;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            
            const topBar = document.createElement('div');
            topBar.className = 'code-top-bar';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy-btn';
            copyBtn.title = 'Copy code';
            copyBtn.innerHTML = '📋';
            copyBtn.addEventListener('click', () => {
                const code = pre.innerText || pre.textContent;
                navigator.clipboard.writeText(code).then(() => {
                    copyBtn.innerHTML = '✅';
                    setTimeout(() => copyBtn.innerHTML = '📋', 2000);
                });
            });
            
            topBar.appendChild(copyBtn);
            wrapper.appendChild(topBar);
            wrapper.appendChild(pre);
        });
    }
}