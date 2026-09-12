import { settings } from '../state/AppSettings.js';

export class TextRenderer {
    static shouldUseMarkdown(content, draftOverride) {
        if (draftOverride !== undefined && draftOverride !== null) return draftOverride;
        return !/<(?:edit|old|new|reasoning)[>\s]/i.test(content) && settings.renderMarkdown;
    }

    static setNodeContent(node, content, draft, isWithinHighlightRange = false) {
        // 1. Global Visual Regexes
        let processed = settings.applyRegexes(content || '', 'visually');

        // 2. Stash raw HTML blocks (used by AI Edits)
        let htmlBlocks = [];
        processed = processed.replace(/<html>([\s\S]*?)<\/html>/gi, (m, inner) => {
            const clean = window.DOMPurify ? window.DOMPurify.sanitize(inner) : inner;
            htmlBlocks.push(clean);
            return `%%HTML_BLOCK_${htmlBlocks.length - 1}%%`;
        });

        // 3. Escape LLM tags like <action>, <thought> so they don't break the DOM
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

        // 6. Apply Slop Highlighting safely on rendered DOM text nodes
        if (isWithinHighlightRange && settings.highlightEnabled && settings.highlightList.trim()) {
            TextRenderer.applySlopHighlighting(node);
        }

        // 7. Inject Code Block Copy Buttons
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

    static applySlopHighlighting(containerNode) {
        const lines = settings.highlightList.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return;

        const regexes = [];
        for (const line of lines) {
            try {
                const match = line.match(/^\/(.+)\/([a-z]*)$/i);
                if (match) {
                    const flags = match[2].includes('g') ? match[2] : match[2] + 'g';
                    regexes.push(new RegExp(match[1], flags));
                } else {
                    const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regexes.push(new RegExp(escaped, 'gi'));
                }
            } catch (e) {}
        }
        if (regexes.length === 0) return;

        const walker = document.createTreeWalker(containerNode, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let currentNode;
        while ((currentNode = walker.nextNode())) {
            const parentTag = currentNode.parentElement ? currentNode.parentElement.tagName.toLowerCase() : '';
            if (parentTag === 'code' || parentTag === 'pre' || parentTag === 'mark') continue;
            if (currentNode.nodeValue.trim().length > 0) {
                textNodes.push(currentNode);
            }
        }

        for (const textNode of textNodes) {
            let text = textNode.nodeValue;
            let hasMatch = false;
            for (const re of regexes) {
                re.lastIndex = 0;
                if (re.test(text)) {
                    hasMatch = true;
                    break;
                }
            }
            if (!hasMatch) continue;

            let safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            for (const re of regexes) {
                re.lastIndex = 0;
                safeText = safeText.replace(re, (m) => `<mark style="background:${settings.highlightBg}; color:${settings.highlightFg};">${m}</mark>`);
            }

            const tempSpan = document.createElement('span');
            tempSpan.innerHTML = safeText;

            const parent = textNode.parentNode;
            if (parent) {
                while (tempSpan.firstChild) {
                    parent.insertBefore(tempSpan.firstChild, textNode);
                }
                parent.removeChild(textNode);
            }
        }
    }
}