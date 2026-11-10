// BEGIN FILE: js/ui/TurnRenderer.js
import { settings } from '../state/AppSettings.js';
import { TextRenderer } from './TextRenderer.js';

export class TurnRenderer {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('output-container');
    }

    renderAll() {
        const oldScrollHeight = this.container.scrollHeight;
        const oldScrollTop = this.container.scrollTop;

        this.container.innerHTML = '';
        this.container.className = `${settings.displayMode}-mode`;

        let startIndex = 0;
        if (this.app.directorManager && this.app.directorManager.isActive) {
            startIndex = 0;
        } else if (settings.visibleOutOfContext !== -1) {
            startIndex = Math.max(0, this.app.state.contextBoundaryIndex - settings.visibleOutOfContext - this.app.historyOffset);
        }

        if (startIndex > 0) {
            const btn = document.createElement('div');
            btn.className = 'load-older-btn';
            btn.textContent = `▲ Load Older Messages (${startIndex} hidden)`;
            btn.onclick = () => {
                this.app.historyOffset += 10;
                this.renderAll();
            };
            this.container.appendChild(btn);
        }

        let lastAsstIndex = -1;
        this.app.state.history.forEach((turn, idx) => {
            if (idx < startIndex) return; 
            if (turn.role === 'assistant' && !turn.isHidden) lastAsstIndex = idx;
            if (idx === this.app.state.contextBoundaryIndex + 1 && this.app.state.contextBoundaryIndex >= 0) {
                const divider = document.createElement('div');
                divider.className = 'context-divider';
                divider.textContent = 'Context Boundary';
                this.container.appendChild(divider);
            }
            this.appendTurnToDOM(turn.role, idx);
        });

        if (startIndex > 0 && this.app.historyOffset > 0 && oldScrollHeight > 0) {
            const newScrollHeight = this.container.scrollHeight;
            this.container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        } else if (!this.app.isUserScrolledUp) {
            this.scrollToBottom();
        }

        if (lastAsstIndex !== -1) {
            const isStreaming = !!this.app.activeBatch; 
            this.app.draftSwitcher.renderSwitcher(lastAsstIndex, isStreaming);
        } else {
            this.app.draftSwitcher.hide();
        }

        this.app.summaryManager.updateSummaryMeter();
    }

    appendTurnToDOM(role, index) {
        const msg = this.app.state.history[index];
        const isStreaming = this.app.activeBatch && index === this.app.state.history.length - 1;
        const isLatestMessage = index === this.app.state.history.length - 1;
        const isOutOfContext = index <= this.app.state.contextBoundaryIndex;
        const isHighlight = index >= this.app.state.history.length - settings.highlightTurnCount;
        
        const wrapper = document.createElement('div');
        wrapper.className = `turn ${role}`;
        if (isOutOfContext) wrapper.classList.add('out-of-context');
        if (msg.isHidden) wrapper.classList.add('hidden-msg');
        wrapper.id = `turn-wrapper-${index}`;

        const bubble = document.createElement('div');
        bubble.className = 'turn-bubble';
        if (this.app.directorManager && this.app.directorManager.isActive && msg._isTargetTurn) {
            bubble.classList.add('director-target-bubble');
        }

        // Marker Pills
        if (msg.markers && msg.markers.length > 0) {
            const markersDiv = document.createElement('div');
            markersDiv.className = 'turn-markers';
            msg.markers.forEach(mk => {
                const badge = document.createElement('span');
                badge.className = `marker-pill ${mk.type}`;
                const icon = mk.type === 'interval_start' ? '▶' : mk.type === 'interval_end' ? '⏹' : '📍';
                badge.textContent = `${icon} ${mk.name}`;
                badge.title = mk.tags ? `Tags: ${mk.tags.join(', ')}` : '';
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.timelineManager.openMarkerModal(index);
                });
                markersDiv.appendChild(badge);
            });
            bubble.appendChild(markersDiv);
        }

        if (role === 'system') {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'turn-content';
            const spanContent = document.createElement('div');
            spanContent.id = `content-${index}`;
            TextRenderer.setNodeContent(spanContent, msg.drafts[0].content || '', msg.drafts[0], isHighlight);
            contentDiv.appendChild(spanContent);
            bubble.appendChild(contentDiv);
        }
        else if (role === 'aggregation') {
            const header = document.createElement('div');
            header.className = 'aggregation-header';
            header.innerHTML = `<span>🛠️ Aggregation Request</span>`;
            bubble.appendChild(header);

            const actionBar = document.createElement('div');
            actionBar.className = 'action-bar';
            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'action-icons';
            
            const btnHide = document.createElement('span');
            btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
            btnHide.className = 'hide-toggle';
            if (msg.isHidden) btnHide.classList.add('active');
            btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
            btnHide.addEventListener('click', (e) => {
                e.stopPropagation();
                msg.isHidden = !msg.isHidden;
                btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
                if (msg.isHidden) wrapper.classList.add('hidden-msg');
                else wrapper.classList.remove('hidden-msg');
                this.app.state.buildPromptPayload();
                this.app.summaryManager.updateSummaryMeter();
                this.app.autoSave();
            });
            iconsDiv.appendChild(btnHide);

            const btnEdit = document.createElement('span');
            btnEdit.textContent = '✏️';
            btnEdit.title = "Edit";
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('edit-message-content').value = msg.meta.displayInput || '';
                document.getElementById('btn-edit-save').dataset.idx = index;
                document.getElementById('edit-modal').classList.remove('hidden');
            });
            iconsDiv.appendChild(btnEdit);
            
            const btnDelete = document.createElement('span');
            btnDelete.textContent = '🗑️';
            btnDelete.title = "Delete";
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm("Delete this message?")) {
                    this.app.state.deleteTurn(index);
                }
            });
            iconsDiv.appendChild(btnDelete);
            
            actionBar.appendChild(document.createElement('span')); 
            actionBar.appendChild(iconsDiv);
            bubble.appendChild(actionBar);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'turn-content';
            contentDiv.style.fontStyle = 'italic';
            contentDiv.style.color = 'var(--text-muted)';
            
            const spanContent = document.createElement('span');
            spanContent.id = `content-${index}`;
            spanContent.textContent = msg.meta.displayInput || '';
            contentDiv.appendChild(spanContent);
            
            bubble.appendChild(contentDiv);
        }
        else if (role === 'gallery') {
            const header = document.createElement('div');
            header.className = 'gallery-header';
            header.innerHTML = `<span>🎨 Image: ${msg.galleryData.promptTitle}</span>`;
            bubble.appendChild(header);

            const actionBar = document.createElement('div');
            actionBar.className = 'action-bar';
            
            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'action-icons';

            const btnHide = document.createElement('span');
            btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
            btnHide.className = 'hide-toggle';
            if (msg.isHidden) btnHide.classList.add('active');
            btnHide.title = "Toggle Preview";
            btnHide.addEventListener('click', (e) => {
                e.stopPropagation();
                msg.isHidden = !msg.isHidden;
                btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                if (msg.isHidden) wrapper.classList.add('hidden-msg');
                else wrapper.classList.remove('hidden-msg');
                this.app.autoSave();
            });
            iconsDiv.appendChild(btnHide);

            const btnRetry = document.createElement('span');
            btnRetry.textContent = '🔄';
            btnRetry.title = 'Regenerate';
            btnRetry.addEventListener('click', () => {
                if (msg.galleryData.status !== 'prompting' && msg.galleryData.status !== 'generating') {
                    this.app.imageGenManager.retryGallery(index);
                }
            });
            iconsDiv.appendChild(btnRetry);

            const btnDelete = document.createElement('span');
            btnDelete.textContent = '🗑️';
            btnDelete.title = 'Delete';
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm("Delete this gallery?")) {
                    this.app.state.deleteTurn(index);
                    if (this.app.avatarManager) this.app.avatarManager.updateAvatarDisplay();
                }
            });
            iconsDiv.appendChild(btnDelete);

            actionBar.appendChild(iconsDiv);
            bubble.appendChild(actionBar);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'gallery-content turn-content';

            if (msg.galleryData.status !== 'done' && msg.galleryData.status !== 'error') {
                const statusEl = document.createElement('div');
                statusEl.className = 'gallery-status';
                statusEl.innerHTML = `<span class="streaming-indicator"></span> ${msg.galleryData.statusText}`;
                
                const btnAbort = document.createElement('button');
                btnAbort.className = 'danger';
                btnAbort.style.marginTop = '8px';
                btnAbort.textContent = 'Stop';
                btnAbort.onclick = () => this.app.imageGenManager.abortGallery(index);

                contentDiv.appendChild(statusEl);
                contentDiv.appendChild(btnAbort);
            } else {
                if (msg.galleryData.images && msg.galleryData.images.length > 0) {
                    const imgObj = msg.galleryData.images[msg.galleryData.activeImageIndex];
                    
                    const imgEl = document.createElement('img');
                    imgEl.src = imgObj.dataUrl;
                    imgEl.className = 'gallery-img';
                    imgEl.onclick = () => this.app.avatarManager.openLightbox(imgObj.dataUrl);

                    const navRow = document.createElement('div');
                    navRow.className = 'gallery-nav';
                    
                    const btnPrev = document.createElement('button');
                    btnPrev.innerHTML = '◀';
                    btnPrev.onclick = () => {
                        msg.galleryData.activeImageIndex = (msg.galleryData.activeImageIndex - 1 + msg.galleryData.images.length) % msg.galleryData.images.length;
                        this.renderAll();
                        this.app.autoSave();
                    };

                    const lblCount = document.createElement('span');
                    lblCount.style.fontSize = '0.9em';
                    const modelName = imgObj.model ? imgObj.model.split('/').pop() : '';
                    lblCount.textContent = modelName 
                        ? `${modelName} (${msg.galleryData.activeImageIndex + 1} of ${msg.galleryData.images.length})` 
                        : `${msg.galleryData.activeImageIndex + 1} of ${msg.galleryData.images.length}`;

                    const btnNext = document.createElement('button');
                    btnNext.innerHTML = '▶';
                    btnNext.onclick = () => {
                        msg.galleryData.activeImageIndex = (msg.galleryData.activeImageIndex + 1) % msg.galleryData.images.length;
                        this.renderAll();
                        this.app.autoSave();
                    };

                    navRow.appendChild(btnPrev);
                    navRow.appendChild(lblCount);
                    navRow.appendChild(btnNext);

                    const actionsRow = document.createElement('div');
                    actionsRow.className = 'gallery-actions';
                    
                    const btnPin = document.createElement('button');
                    btnPin.textContent = '📌 Set Avatar';
                    btnPin.onclick = () => this.app.avatarManager.pinAvatar(imgObj.id);

                    const btnPrompt = document.createElement('button');
                    btnPrompt.textContent = '📝 View Prompt';

                    const btnDownload = document.createElement('button');
                    btnDownload.textContent = '💾 Download';
                    btnDownload.onclick = () => {
                        const a = document.createElement('a');
                        a.href = imgObj.dataUrl;
                        a.download = `image_${Date.now()}.jpg`;
                        a.click();
                    };
                    const promptCode = document.createElement('pre');
                    promptCode.className = 'hidden';
                    promptCode.style.fontSize = '0.8em';
                    promptCode.style.whiteSpace = 'pre-wrap';
                    promptCode.style.marginTop = '8px';
                    promptCode.textContent = msg.galleryData.imagePrompt || '';
                    btnPrompt.onclick = () => promptCode.classList.toggle('hidden');

                    actionsRow.appendChild(btnPin);
                    actionsRow.appendChild(btnPrompt);
                    actionsRow.appendChild(btnDownload);

                    contentDiv.appendChild(imgEl);
                    contentDiv.appendChild(navRow);
                    contentDiv.appendChild(actionsRow);
                    contentDiv.appendChild(promptCode);
                } else {
                    const errEl = document.createElement('p');
                    errEl.style.color = 'var(--danger)';
                    errEl.textContent = msg.galleryData.statusText || 'No images generated.';
                    contentDiv.appendChild(errEl);
                }
            }
            bubble.appendChild(contentDiv);
        }
        else if (role === 'choices') {
            if (msg.extractedChoices === null) {
                const header = document.createElement('div');
                header.className = 'choices-header';
                header.innerHTML = `<span>Scrying possible futures...</span> <span class="streaming-indicator"></span>`;
                bubble.appendChild(header);

                const statusRow = document.createElement('div');
                statusRow.className = 'switcher-status';
                statusRow.style.justifyContent = 'center';
                
                msg.drafts.forEach((d, i) => {
                    const spanGroup = document.createElement('span');
                    const icon = document.createElement('span');
                    icon.id = `choice-icon-${index}-${i}`;
                    icon.textContent = '🕒';
                    const timer = document.createElement('span');
                    timer.id = `choice-timer-${index}-${i}`;
                    timer.style.marginLeft = '4px';
                    timer.textContent = '(0.0s)';
                    spanGroup.appendChild(icon);
                    spanGroup.appendChild(timer);
                    statusRow.appendChild(spanGroup);
                });
                bubble.appendChild(statusRow);
            } else {
                const header = document.createElement('div');
                header.className = 'choices-header';
                header.textContent = `Select a Path (${settings.activeChoicePromptTitle})`;
                bubble.appendChild(header);

                msg.extractedChoices.forEach(choiceText => {
                    const card = document.createElement('div');
                    card.className = 'choice-card';
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'choice-card-content';
                    const visuallyApplied = settings.applyRegexes(choiceText, 'visually');
                    contentDiv.innerHTML = marked.parseInline(visuallyApplied);
                    
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'choice-card-actions';

                    const btnInsert = document.createElement('button');
                    btnInsert.innerHTML = '📝';
                    btnInsert.title = 'Insert to input';
                    btnInsert.addEventListener('click', () => {
                        const currentVal = this.app.input.value;
                        this.app.input.value = currentVal ? currentVal + ' ' + choiceText : choiceText;
                        this.app.input.style.height = 'auto';
                        this.app.input.style.height = (this.app.input.scrollHeight) + 'px';
                        this.app.input.focus();
                    });

                    const btnSend = document.createElement('button');
                    btnSend.innerHTML = '🚀';
                    btnSend.title = 'Send instantly';
                    btnSend.addEventListener('click', () => {
                        this.app.input.value = choiceText;
                        this.app.input.style.height = 'auto';
                        this.app.input.style.height = (this.app.input.scrollHeight) + 'px';
                        this.app.handleSend();
                    });

                    actionsDiv.appendChild(btnInsert);
                    actionsDiv.appendChild(btnSend);

                    card.appendChild(contentDiv);
                    card.appendChild(actionsDiv);
                    bubble.appendChild(card);
                });

                const hr = document.createElement('hr');
                hr.style.margin = '8px 0';
                bubble.appendChild(hr);

                const footerGrid = document.createElement('div');
                footerGrid.className = 'action-grid';
                
                const btnReroll = document.createElement('button');
                btnReroll.className = 'secondary';
                btnReroll.textContent = '🔄 Reroll';
                btnReroll.addEventListener('click', () => {
                    this.app.state.deleteTurn(index);
                    this.app.brainstormManager.startChoicesGeneration();
                });
                
                const btnDel = document.createElement('button');
                btnDel.className = 'danger';
                btnDel.textContent = '🗑️ Delete';
                btnDel.addEventListener('click', () => {
                    this.app.state.deleteTurn(index);
                });

                footerGrid.appendChild(btnReroll);
                footerGrid.appendChild(btnDel);
                bubble.appendChild(footerGrid);
            }
        } else {
            const activeDraft = msg.drafts[msg.activeDraftIndex];
            const content = activeDraft.content;
            const reasoning = activeDraft.reasoning;

            if (!isStreaming) {
                const actionBar = document.createElement('div');
                actionBar.className = 'action-bar';
                
                const metaSpan = document.createElement('span');
                metaSpan.id = `meta-span-${index}`;
                const msgNumber = `#${index + 1}`;
                if (activeDraft.model) {
                    const shortModel = activeDraft.model.split('/').pop();
                    metaSpan.textContent = `${msgNumber} • ${shortModel} • ${activeDraft.isStale ? '[X]' : activeDraft.duration + 's'}`;
                } else {
                    metaSpan.textContent = msgNumber;
                }
                actionBar.appendChild(metaSpan);

                if (this.app.directorManager && this.app.directorManager.isActive && msg._originIndex !== undefined) {
                    const dirSpan = document.createElement('span');
                    dirSpan.style.fontSize = "0.85em";
                    dirSpan.style.marginLeft = "8px";
                    if (msg._isTargetTurn) {
                        dirSpan.innerHTML = '<strong style="color:#fb923c;">[🎬 Target]</strong>';
                    } else {
                        dirSpan.innerHTML = `<span style="color:var(--text-muted);">[Original #${msg._originIndex + 1}]</span>`;
                    }
                    actionBar.appendChild(dirSpan);
                }

                const iconsDiv = document.createElement('div');
                iconsDiv.className = 'action-icons';

                if (reasoning) {
                    const btnThink = document.createElement('span');
                    btnThink.textContent = '🧠';
                    btnThink.className = 'think-toggle';
                    btnThink.title = "Toggle Thinking";
                    btnThink.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const rDiv = document.getElementById(`reasoning-block-${index}`);
                        if (rDiv) {
                            rDiv.classList.toggle('hidden');
                            btnThink.classList.toggle('active');
                        }
                    });
                    iconsDiv.appendChild(btnThink);
                }

                const btnHide = document.createElement('span');
                btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                btnHide.className = 'hide-toggle';
                if (msg.isHidden) btnHide.classList.add('active');
                btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
                btnHide.addEventListener('click', (e) => {
                    e.stopPropagation();
                    msg.isHidden = !msg.isHidden;
                    btnHide.textContent = msg.isHidden ? '🙈' : '👁️';
                    btnHide.title = msg.isHidden ? "Unhide from context" : "Hide from context";
                    if (msg.isHidden) wrapper.classList.add('hidden-msg');
                    else wrapper.classList.remove('hidden-msg');
                    this.app.state.buildPromptPayload();
                    this.app.summaryManager.updateSummaryMeter();
                    this.app.autoSave();
                });
                iconsDiv.appendChild(btnHide);

                const btnMd = document.createElement('span');
                btnMd.id = `btn-md-${index}`;
                btnMd.textContent = 'Ⓜ️';
                btnMd.className = 'md-toggle';
                btnMd.title = "Toggle Markdown";
                if (TextRenderer.shouldUseMarkdown(content || '', activeDraft.markdownOverride)) btnMd.classList.add('active');
                btnMd.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const currentDraft = this.app.state.history[index].drafts[this.app.state.history[index].activeDraftIndex];
                    const currentlyOn = TextRenderer.shouldUseMarkdown(currentDraft.content, currentDraft.markdownOverride);
                    currentDraft.markdownOverride = !currentlyOn;
                    this.renderAll();
                    this.app.autoSave();
                });
                iconsDiv.appendChild(btnMd);

                const btnCopy = document.createElement('span');
                btnCopy.textContent = '📋';
                btnCopy.title = "Copy";
                btnCopy.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(this.app.state.getContent(index)); });
                iconsDiv.appendChild(btnCopy);

                const btnEdit = document.createElement('span');
                btnEdit.textContent = '✏️';
                btnEdit.title = "Edit";
                btnEdit.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.getElementById('edit-message-content').value = this.app.state.getContent(index);
                    document.getElementById('btn-edit-save').dataset.idx = index;
                    document.getElementById('edit-modal').classList.remove('hidden');
                });
                iconsDiv.appendChild(btnEdit);

                if (role === 'assistant') {
                    const btnDeslop = document.createElement('span');
                    btnDeslop.textContent = '🧹';
                    btnDeslop.title = "Sentence-by-Sentence Rewrite (Deslop)";
                    btnDeslop.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.app.rewriterManager.openStagedRewriteModal(index);
                    });
                    iconsDiv.appendChild(btnDeslop);
                }

                const btnInject = document.createElement('span');
                btnInject.textContent = '💉';
                btnInject.title = "Inject Turn Below";
                btnInject.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.openInjectModal(index);
                });
                iconsDiv.appendChild(btnInject);

                const btnUsage = document.createElement('span');
                btnUsage.id = `btn-usage-${index}`;
                btnUsage.textContent = '📊';
                btnUsage.title = "Token Usage";
                btnUsage.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const currentDraft = this.app.state.history[index].drafts[this.app.state.history[index].activeDraftIndex];
                    if (currentDraft.usage) {
                        document.getElementById('usage-prompt').textContent = currentDraft.usage.prompt_tokens || 0;
                        
                        const compTokens = currentDraft.usage.completion_tokens || 0;
                        const reasonTokens = currentDraft.usage.completion_tokens_details?.reasoning_tokens || 0;
                        
                        const usageCompletionEl = document.getElementById('usage-completion');
                        const usageReasoningRow = document.getElementById('usage-reasoning-row');
                        
                        if (reasonTokens > 0) {
                            usageCompletionEl.textContent = `${compTokens - reasonTokens} (Output) + ${reasonTokens}`;
                            document.getElementById('usage-reasoning').textContent = reasonTokens;
                            usageReasoningRow.classList.remove('hidden');
                        } else {
                            usageCompletionEl.textContent = compTokens;
                            usageReasoningRow.classList.add('hidden');
                        }
                        
                        document.getElementById('usage-total').textContent = currentDraft.usage.total_tokens || 0;
                        document.getElementById('usage-modal').classList.remove('hidden');
                    }
                });
                
                if (role !== 'assistant' || !activeDraft.usage) {
                    btnUsage.classList.add('hidden');
                }
                iconsDiv.appendChild(btnUsage);

                if (role === 'assistant' && isLatestMessage && this.app.state.lastRawPayload) {
                    const btnPrompt = document.createElement('span');
                    btnPrompt.textContent = '🔍';
                    btnPrompt.title = "View Prompt Payload";
                    btnPrompt.addEventListener('click', (e) => {
                        e.stopPropagation();
                        document.getElementById('prompt-payload-content').textContent = JSON.stringify(this.app.state.lastRawPayload, null, 2);
                        document.getElementById('prompt-modal').classList.remove('hidden');
                    });
                    iconsDiv.appendChild(btnPrompt);
                }

                if (!this.app.directorManager || !this.app.directorManager.isActive) {
                    const btnDirector = document.createElement('span');
                    btnDirector.textContent = '🎬';
                    btnDirector.title = "Director Mode (Sandbox Revision)";
                    btnDirector.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.app.directorManager.enter(index);
                    });
                    iconsDiv.appendChild(btnDirector);
                }

                const btnDelete = document.createElement('span');
                btnDelete.textContent = '🗑️';
                btnDelete.title = "Delete";
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    if (msg.markers && msg.markers.length > 0) {
                        const action = prompt("This message has story markers.\nType 'prev' to shift them up,\n'next' to shift them down,\n'drop' to delete them entirely.", "drop");
                        if (action === null) return;
                        if (action.trim().toLowerCase() === 'prev' && index > 0) {
                            this.app.state.history[index - 1].markers.push(...msg.markers);
                        } else if (action.trim().toLowerCase() === 'next' && index < this.app.state.history.length - 1) {
                            this.app.state.history[index + 1].markers.push(...msg.markers);
                        }
                    }

                    if (confirm("Delete this message?")) {
                        this.app.state.deleteTurn(index);
                    }
                });
                iconsDiv.appendChild(btnDelete);

                const btnMarker = document.createElement('span');
                btnMarker.textContent = '📍';
                btnMarker.title = "Manage Story Markers";
                btnMarker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.timelineManager.openMarkerModal(index);
                });
                iconsDiv.appendChild(btnMarker);    

                actionBar.appendChild(iconsDiv);
                bubble.appendChild(actionBar);
            }

            const reasoningDiv = document.createElement('div');
            reasoningDiv.className = 'thinking-block';
            reasoningDiv.id = `reasoning-block-${index}`;
            if (!reasoning || (!isStreaming && role === 'assistant')) reasoningDiv.classList.add('hidden');
            
            const spanReason = document.createElement('span');
            spanReason.id = `reasoning-${index}`;
            spanReason.textContent = reasoning || '';
            reasoningDiv.appendChild(spanReason);
            bubble.appendChild(reasoningDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'turn-content';
            
            const spanContent = document.createElement('div');
            spanContent.style.display = "inline";
            spanContent.id = `content-${index}`;
            TextRenderer.setNodeContent(spanContent, content || '', activeDraft, isHighlight);
            contentDiv.appendChild(spanContent);
            
            if (isStreaming) {
                const cursor = document.createElement('span');
                cursor.className = 'streaming-indicator';
                cursor.id = `cursor-${index}`;
                contentDiv.appendChild(cursor);
            }

            bubble.appendChild(contentDiv);
        }

        wrapper.appendChild(bubble);
        this.container.appendChild(wrapper);
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
        document.getElementById('btn-jump-bottom').classList.add('hidden');
    }
}
// END FILE: js/ui/TurnRenderer.js