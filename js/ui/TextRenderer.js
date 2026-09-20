// BEGIN FILE: js/ui/TextRenderer.js
import { settings } from '../state/AppSettings.js';

export class TextRenderer {
    static shouldUseMarkdown(content, draftOverride) {
        if (draftOverride !== undefined && draftOverride !== null) return draftOverride;
        return !/<(?:edit|old|new|reasoning)[>\s]/i.test(content) && settings.renderMarkdown;
    }

    static setNodeContent(node, content, draft, isWithinHighlightRange = false) {
        const useMarkdown = TextRenderer.shouldUseMarkdown(content, draft?.markdownOverride);
        
        // 1. Get raw tokens via AST to maintain a 1:1 mapping with Surgical Edit
        const tokens = marked.lexer(content || '');
        let finalHtml = '';

        tokens.forEach((token, idx) => {
            // 2. Global Visual Regexes applied to the token's exact raw text
            let processed = settings.applyRegexes(token.raw, 'visually');

            // 3. Stash raw HTML blocks (used by AI Edits)
            let htmlBlocks = [];
            processed = processed.replace(/<html>([\s\S]*?)<\/html>/gi, (m, inner) => {
                const clean = window.DOMPurify ? window.DOMPurify.sanitize(inner) : inner;
                htmlBlocks.push(clean);
                return `%%HTML_BLOCK_${idx}_${htmlBlocks.length - 1}%%`;
            });

            // 4. Escape LLM tags like <action>, <thought> so they don't break the DOM
            processed = processed.replace(/<(\/?)([a-zA-Z][^>]*)>/g, '&lt;$1$2&gt;');

            // 5. Markdown Rendering per block
            let blockHtml;
            if (useMarkdown) {
                blockHtml = marked.parse(processed);
            } else {
                blockHtml = processed.replace(/\n/g, '<br>');
            }

            // 6. Restore HTML Blocks
            htmlBlocks.forEach((block, i) => {
                blockHtml = blockHtml.replace(`%%HTML_BLOCK_${idx}_${i}%%`, block);
            });

            // Wrap in AST mapping tracking div
            finalHtml += `<div class="md-block" data-block-idx="${idx}">${blockHtml}</div>`;
        });

        if (useMarkdown) {
            node.classList.add('markdown-body');
        } else {
            node.classList.remove('markdown-body');
        }

        node.innerHTML = finalHtml;

        // 7. Apply Slop Highlighting safely on rendered DOM text nodes
        if (isWithinHighlightRange && settings.highlightEnabled && settings.highlightList.trim()) {
            TextRenderer.applySlopHighlighting(node);
        }

        // 8. Inject Code Block Copy Buttons
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
// END FILE: js/ui/TextRenderer.js