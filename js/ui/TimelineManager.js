// BEGIN FILE: js/ui/TimelineManager.js
export class TimelineManager {
    constructor(app) {
        this.app = app;
        this.activeMsgIndex = -1;
        this.activeTagInputId = null; // Tracks which input the Tag Picker should write to
        this.buildUI();
        this.bindEvents();
    }

    buildUI() {
        // 1. Inject Timeline Drawer & Overlay
        const overlay = document.createElement('div');
        overlay.className = 'timeline-overlay';
        overlay.id = 'timeline-overlay';
        document.body.appendChild(overlay);

        const drawer = document.createElement('div');
        drawer.className = 'timeline-drawer';
        drawer.id = 'timeline-drawer';
        drawer.innerHTML = `
            <div class="timeline-header">
                <span>📑 Story Timeline</span>
                <button id="btn-close-timeline" class="close-btn">&times;</button>
            </div>
            <div class="timeline-search">
                <input id="timeline-search-input" type="text" placeholder="Search (e.g. math, chris)...">
                <button id="timeline-search-clear" class="timeline-search-clear" title="Clear Search">&times;</button>
            </div>
            <div class="timeline-content" id="timeline-list"></div>
        `;
        document.body.appendChild(drawer);

        // 2. Inject Marker Modal
        const modal = document.createElement('div');
        modal.className = 'modal hidden';
        modal.id = 'marker-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; height: auto; max-height: 90vh;">
                <div class="modal-header">
                    <span id="marker-modal-title" style="font-weight: bold;">Manage Markers</span>
                    <button id="btn-close-marker-modal" class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="existing-markers-container" style="margin-bottom: 16px;"></div>
                    <hr>
                    <div id="marker-actions-row" style="display:flex; gap:8px;">
                        <button id="btn-add-new-marker" class="primary" style="flex:1;">+ New Event</button>
                        <button id="btn-close-open-interval" class="secondary" style="flex:1;">+ Close Interval</button>
                    </div>
                    
                    <div id="marker-create-form" class="hidden" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <select id="marker-type-select">
                            <option value="point">📍 Point Event</option>
                            <option value="interval_start">▶ Interval Start</option>
                            <option value="interval_end">⏹ Interval End (Manual)</option>
                        </select>
                        <input type="text" id="marker-name-input" placeholder="Event Name (e.g. Club Meeting)">
                        <div class="tag-input-group">
                            <input type="text" id="marker-tags-input" placeholder="Tags (comma separated)">
                            <button id="btn-pick-tags-create" class="secondary btn-open-tags" title="Pick Tags">🏷️</button>
                        </div>
                        <div style="display:flex; gap:8px; justify-content: flex-end;">
                            <button id="btn-cancel-create-marker" class="secondary">Cancel</button>
                            <button id="btn-save-create-marker" class="primary">Save</button>
                        </div>
                    </div>

                    <div id="marker-close-interval-form" class="hidden" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="font-size: 0.9em; font-weight: bold; color: var(--text-muted);">Select open interval to close:</div>
                        <div id="open-intervals-list" style="display:flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto;"></div>
                        <button id="btn-cancel-close-interval" class="secondary" style="align-self: flex-end;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 3. Inject Tag Picker Sub-Modal
        const tagPickerModal = document.createElement('div');
        tagPickerModal.className = 'modal hidden';
        tagPickerModal.id = 'tag-picker-modal';
        tagPickerModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; height: auto; max-height: 80vh;">
                <div class="modal-header">
                    <span style="font-weight: bold;">Select Tags</span>
                    <button id="btn-close-tag-picker" class="close-btn">&times;</button>
                </div>
                <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px;">
                    <div id="tag-picker-grid" class="tag-picker-grid"></div>
                    <div style="display:flex; justify-content: flex-end; gap:8px;">
                        <button id="btn-cancel-tag-picker" class="secondary">Cancel</button>
                        <button id="btn-apply-tag-picker" class="primary">Apply</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(tagPickerModal);
    }

    bindEvents() {
        // Timeline Drawer
        const btnOpen = document.getElementById('btn-open-timeline');
        if (btnOpen) btnOpen.addEventListener('click', () => this.toggleDrawer());
        document.getElementById('timeline-overlay').addEventListener('click', () => this.toggleDrawer(false));
        document.getElementById('btn-close-timeline').addEventListener('click', () => this.toggleDrawer(false));

        // Search Bar
        const searchInput = document.getElementById('timeline-search-input');
        searchInput.addEventListener('input', () => this.renderDrawer());
        document.getElementById('timeline-search-clear').addEventListener('click', () => {
            searchInput.value = '';
            this.renderDrawer();
        });

        // Marker Modal Base
        document.getElementById('btn-close-marker-modal').addEventListener('click', () => {
            document.getElementById('marker-modal').classList.add('hidden');
        });

        document.getElementById('btn-add-new-marker').addEventListener('click', () => {
            document.getElementById('marker-actions-row').classList.add('hidden');
            document.getElementById('marker-create-form').classList.remove('hidden');
        });
        document.getElementById('btn-cancel-create-marker').addEventListener('click', () => {
            document.getElementById('marker-create-form').classList.add('hidden');
            document.getElementById('marker-actions-row').classList.remove('hidden');
        });
        document.getElementById('btn-save-create-marker').addEventListener('click', () => this.saveNewMarker());

        document.getElementById('btn-close-open-interval').addEventListener('click', () => {
            this.renderOpenIntervals();
            document.getElementById('marker-actions-row').classList.add('hidden');
            document.getElementById('marker-close-interval-form').classList.remove('hidden');
        });
        document.getElementById('btn-cancel-close-interval').addEventListener('click', () => {
            document.getElementById('marker-close-interval-form').classList.add('hidden');
            document.getElementById('marker-actions-row').classList.remove('hidden');
        });

        // Tag Picker
        document.getElementById('btn-pick-tags-create').addEventListener('click', () => this.openTagPicker('marker-tags-input'));
        document.getElementById('btn-close-tag-picker').addEventListener('click', () => document.getElementById('tag-picker-modal').classList.add('hidden'));
        document.getElementById('btn-cancel-tag-picker').addEventListener('click', () => document.getElementById('tag-picker-modal').classList.add('hidden'));
        document.getElementById('btn-apply-tag-picker').addEventListener('click', () => this.applyPickedTags());
    }

    toggleDrawer(forceState) {
        const drawer = document.getElementById('timeline-drawer');
        const overlay = document.getElementById('timeline-overlay');
        const isOpen = drawer.classList.contains('open');
        const shouldOpen = forceState !== undefined ? forceState : !isOpen;

        if (shouldOpen) {
            this.renderDrawer();
            drawer.classList.add('open');
            overlay.classList.add('open');
        } else {
            drawer.classList.remove('open');
            overlay.classList.remove('open');
        }
    }

    // --- TAG PICKER LOGIC ---

    openTagPicker(targetInputId) {
        this.activeTagInputId = targetInputId;
        
        // Extract all unique tags
        const allTags = new Set();
        this.app.state.history.forEach(msg => {
            if (msg.markers) {
                msg.markers.forEach(mk => {
                    if (mk.tags) mk.tags.forEach(t => allTags.add(t));
                });
            }
        });

        const grid = document.getElementById('tag-picker-grid');
        grid.innerHTML = '';
        
        if (allTags.size === 0) {
            grid.innerHTML = '<span style="color:var(--text-muted); font-size:0.9em; padding: 10px;">No tags used in this story yet.</span>';
        } else {
            // Read currently entered tags in the target input
            const targetInput = document.getElementById(targetInputId);
            const currentVals = targetInput.value.split(',').map(t => t.trim().toLowerCase()).filter(t => t);

            Array.from(allTags).sort().forEach(tag => {
                const chip = document.createElement('div');
                chip.className = 'tag-picker-chip';
                if (currentVals.includes(tag.toLowerCase())) {
                    chip.classList.add('selected');
                }
                chip.textContent = tag;
                chip.dataset.val = tag;
                
                chip.addEventListener('click', () => {
                    chip.classList.toggle('selected');
                });
                grid.appendChild(chip);
            });
        }

        document.getElementById('tag-picker-modal').classList.remove('hidden');
    }

    applyPickedTags() {
        const selected = Array.from(document.querySelectorAll('.tag-picker-chip.selected')).map(c => c.dataset.val);
        const targetInput = document.getElementById(this.activeTagInputId);
        
        if (targetInput) {
            // We append selected tags, keeping any custom tags the user manually typed that aren't in the pool
            const manualVals = targetInput.value.split(',').map(t => t.trim()).filter(t => t);
            const selectedLower = selected.map(s => s.toLowerCase());
            
            // Keep manually typed tags that were NOT selected from the pool (prevents destruction of new tags)
            const poolTagsLower = Array.from(document.querySelectorAll('.tag-picker-chip')).map(c => c.dataset.val.toLowerCase());
            const customKept = manualVals.filter(t => !poolTagsLower.includes(t.toLowerCase()));
            
            const finalTags = [...new Set([...customKept, ...selected])];
            targetInput.value = finalTags.join(', ');
        }
        document.getElementById('tag-picker-modal').classList.add('hidden');
    }

    // --- MARKER MODAL LOGIC ---

    openMarkerModal(msgIndex) {
        this.activeMsgIndex = msgIndex;
        document.getElementById('marker-modal-title').textContent = `Markers for Message #${msgIndex + 1}`;
        
        document.getElementById('marker-create-form').classList.add('hidden');
        document.getElementById('marker-close-interval-form').classList.add('hidden');
        document.getElementById('marker-actions-row').classList.remove('hidden');

        document.getElementById('marker-name-input').value = '';
        document.getElementById('marker-tags-input').value = '';

        this.renderExistingMarkers();
        document.getElementById('marker-modal').classList.remove('hidden');
    }

    renderExistingMarkers() {
        const container = document.getElementById('existing-markers-container');
        container.innerHTML = '';
        const msg = this.app.state.history[this.activeMsgIndex];
        if (!msg || !msg.markers || msg.markers.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted); font-size:0.9em;">No markers on this message.</span>';
            return;
        }

        msg.markers.forEach((mk, i) => {
            const card = document.createElement('div');
            card.className = 'marker-modal-card';
            card.id = `marker-card-${mk.id}`;
            
            // Read-Only View
            const viewDiv = document.createElement('div');
            viewDiv.style.flex = "1";
            viewDiv.style.display = "flex";
            viewDiv.style.justifyContent = "space-between";
            viewDiv.style.alignItems = "center";

            const info = document.createElement('div');
            const icon = mk.type === 'interval_start' ? '▶' : mk.type === 'interval_end' ? '⏹' : '📍';
            info.innerHTML = `<strong>${icon} ${mk.name}</strong>`;
            if (mk.tags && mk.tags.length > 0) {
                info.innerHTML += `<br><span style="font-size:0.8em; color:var(--text-muted);">Tags: ${mk.tags.join(', ')}</span>`;
            }

            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '6px';

            const btnEdit = document.createElement('button');
            btnEdit.className = 'secondary';
            btnEdit.textContent = '✎';
            btnEdit.style.padding = '4px 8px';

            const btnDel = document.createElement('button');
            btnDel.className = 'danger';
            btnDel.textContent = '🗑️';
            btnDel.style.padding = '4px 8px';
            btnDel.onclick = () => {
                msg.markers.splice(i, 1);
                this.app.renderAll();
                this.app.autoSave();
                this.renderExistingMarkers();
            };

            actionsDiv.appendChild(btnEdit);
            actionsDiv.appendChild(btnDel);
            viewDiv.appendChild(info);
            viewDiv.appendChild(actionsDiv);

            // Edit View Form
            const editDiv = document.createElement('div');
            editDiv.className = 'marker-edit-form hidden';
            
            const typeLabel = mk.type.replace('_', ' ');
            editDiv.innerHTML = `
                <div class="edit-type-label">Type: ${typeLabel} (Locked)</div>
                <input type="text" id="edit-name-${mk.id}" value="${mk.name}" placeholder="Event Name">
                <div class="tag-input-group">
                    <input type="text" id="edit-tags-${mk.id}" value="${(mk.tags || []).join(', ')}" placeholder="Tags (comma separated)">
                    <button id="btn-pick-tags-${mk.id}" class="secondary btn-open-tags" title="Pick Tags">🏷️</button>
                </div>
                <div style="display:flex; justify-content: flex-end; gap:6px; margin-top: 4px;">
                    <button class="secondary btn-cancel-edit">Cancel</button>
                    <button class="primary btn-save-edit">Save</button>
                </div>
            `;

            // Toggle Edit Mode
            btnEdit.onclick = () => {
                viewDiv.classList.add('hidden');
                editDiv.classList.remove('hidden');
            };

            // Edit Form Event Bindings
            editDiv.querySelector('.btn-cancel-edit').onclick = () => {
                editDiv.classList.add('hidden');
                viewDiv.classList.remove('hidden');
                editDiv.querySelector(`#edit-name-${mk.id}`).value = mk.name;
                editDiv.querySelector(`#edit-tags-${mk.id}`).value = (mk.tags || []).join(', ');
            };

            editDiv.querySelector(`#btn-pick-tags-${mk.id}`).onclick = () => {
                this.openTagPicker(`edit-tags-${mk.id}`);
            };

            editDiv.querySelector('.btn-save-edit').onclick = () => {
                const newName = editDiv.querySelector(`#edit-name-${mk.id}`).value.trim();
                const newTagsStr = editDiv.querySelector(`#edit-tags-${mk.id}`).value;
                const newTags = newTagsStr.split(',').map(t => t.trim()).filter(t => t);

                if (!newName) return alert("Name is required.");

                mk.name = newName;
                mk.tags = newTags;

                // Partner Sync Logic
                if (mk.intervalId && mk.intervalId !== 'manual') {
                    this.app.state.history.forEach(historyMsg => {
                        if (!historyMsg.markers) return;
                        historyMsg.markers.forEach(partner => {
                            if (partner.intervalId === mk.intervalId && partner.id !== mk.id) {
                                partner.name = newName;
                                partner.tags = [...newTags];
                            }
                        });
                    });
                }

                this.app.renderAll();
                this.app.autoSave();
                this.renderExistingMarkers();
            };

            card.appendChild(viewDiv);
            card.appendChild(editDiv);
            container.appendChild(card);
        });
    }

    saveNewMarker() {
        const type = document.getElementById('marker-type-select').value;
        const name = document.getElementById('marker-name-input').value.trim();
        const tagsStr = document.getElementById('marker-tags-input').value;
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

        if (!name) return alert("Marker name is required.");

        const marker = {
            id: Math.random().toString(36).substring(2, 9),
            type: type,
            name: name,
            tags: tags
        };

        if (type === 'interval_start') {
            marker.intervalId = Math.random().toString(36).substring(2, 9);
        } else if (type === 'interval_end') {
            marker.intervalId = 'manual';
        }

        const msg = this.app.state.history[this.activeMsgIndex];
        if (!msg.markers) msg.markers = [];
        msg.markers.push(marker);

        this.app.renderAll();
        this.app.autoSave();
        
        document.getElementById('marker-create-form').classList.add('hidden');
        document.getElementById('marker-actions-row').classList.remove('hidden');
        this.renderExistingMarkers();
    }

    renderOpenIntervals() {
        const container = document.getElementById('open-intervals-list');
        container.innerHTML = '';

        const starts = {};
        const ends = new Set();
        
        this.app.state.history.forEach((msg, idx) => {
            if (!msg.markers) return;
            msg.markers.forEach(mk => {
                if (mk.type === 'interval_start') {
                    starts[mk.intervalId] = { ...mk, msgIndex: idx };
                } else if (mk.type === 'interval_end' && mk.intervalId) {
                    ends.add(mk.intervalId);
                }
            });
        });

        const openIntervals = Object.values(starts).filter(st => 
            !ends.has(st.intervalId) && st.msgIndex <= this.activeMsgIndex
        );

        if (openIntervals.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted); font-size:0.9em;">No open intervals available prior to this point.</span>';
            return;
        }

        openIntervals.forEach(st => {
            const btn = document.createElement('button');
            btn.className = 'secondary';
            btn.style.textAlign = 'left';
            btn.style.display = 'flex';
            btn.style.justifyContent = 'space-between';
            
            const dist = this.activeMsgIndex - st.msgIndex;
            btn.innerHTML = `<span>▶ ${st.name}</span> <span style="opacity:0.6; font-size:0.85em;">(Started ${dist} msgs ago)</span>`;
            
            btn.onclick = () => {
                const msg = this.app.state.history[this.activeMsgIndex];
                msg.markers.push({
                    id: Math.random().toString(36).substring(2, 9),
                    type: 'interval_end',
                    name: st.name,
                    intervalId: st.intervalId,
                    tags: [...(st.tags || [])]
                });
                
                this.app.renderAll();
                this.app.autoSave();
                
                document.getElementById('marker-close-interval-form').classList.add('hidden');
                document.getElementById('marker-actions-row').classList.remove('hidden');
                this.renderExistingMarkers();
            };
            container.appendChild(btn);
        });
    }

    // --- DRAWER TIMELINE LOGIC WITH SEARCH ---

    renderDrawer() {
        const list = document.getElementById('timeline-list');
        list.innerHTML = '';

        const searchVal = document.getElementById('timeline-search-input').value.trim().toLowerCase();
        const searchTerms = searchVal ? searchVal.split(',').map(t => t.trim()).filter(t => t) : [];

        // 1. Identify matched Interval IDs so partners stay visible
        const matchedIntervalIds = new Set();
        if (searchTerms.length > 0) {
            this.app.state.history.forEach(msg => {
                if (!msg.markers) return;
                msg.markers.forEach(mk => {
                    const match = searchTerms.every(term => 
                        mk.name.toLowerCase().includes(term) || 
                        (mk.tags && mk.tags.some(tag => tag.toLowerCase().includes(term)))
                    );
                    if (match && mk.intervalId && mk.intervalId !== 'manual') {
                        matchedIntervalIds.add(mk.intervalId);
                    }
                });
            });
        }

        let renderedCount = 0;

        this.app.state.history.forEach((msg, idx) => {
            if (!msg.markers || msg.markers.length === 0) return;

            msg.markers.forEach(mk => {
                // Determine if this specific marker matches
                const isDirectMatch = searchTerms.length === 0 || searchTerms.every(term => 
                    mk.name.toLowerCase().includes(term) || 
                    (mk.tags && mk.tags.some(tag => tag.toLowerCase().includes(term)))
                );

                // If not a direct match, check if its partner was matched
                const isPartnerMatch = mk.intervalId && matchedIntervalIds.has(mk.intervalId);

                if (!isDirectMatch && !isPartnerMatch) return;

                renderedCount++;

                const item = document.createElement('div');
                item.className = 'timeline-item';
                item.onclick = () => this.jumpToMessage(idx);

                const title = document.createElement('div');
                title.className = 'timeline-item-title';
                
                let icon = '📍';
                let color = '#60a5fa';
                if (mk.type === 'interval_start') { icon = '▶'; color = '#4ade80'; }
                if (mk.type === 'interval_end') { icon = '⏹'; color = '#fb923c'; }

                title.innerHTML = `<span style="color:${color};">${icon}</span> <span>${mk.name}</span>`;

                const meta = document.createElement('div');
                meta.className = 'timeline-item-meta';
                meta.textContent = `Turn #${idx + 1}`;

                item.appendChild(title);
                item.appendChild(meta);

                const footer = document.createElement('div');
                footer.className = 'timeline-item-footer';

                const tagDiv = document.createElement('div');
                tagDiv.className = 'timeline-item-tags';
                if (mk.tags && mk.tags.length > 0) {
                    mk.tags.forEach(t => {
                        const pill = document.createElement('span');
                        pill.className = 'tag-pill';
                        pill.textContent = t;
                        tagDiv.appendChild(pill);
                    });
                }
                footer.appendChild(tagDiv);

                const btnDel = document.createElement('button');
                btnDel.className = 'timeline-item-delete';
                btnDel.textContent = '🗑️';
                btnDel.title = 'Delete marker';
                btnDel.onclick = (e) => {
                    e.stopPropagation(); // Prevent jumping to message
                    this.deleteMarkerFromDrawer(idx, mk);
                };
                footer.appendChild(btnDel);

                item.appendChild(footer);

                list.appendChild(item);
            });
        });

        if (renderedCount === 0) {
            if (searchTerms.length > 0) {
                list.innerHTML = '<div style="color:var(--text-muted); text-align:center; margin-top:20px;">No markers match your search.</div>';
            } else {
                list.innerHTML = '<div style="color:var(--text-muted); text-align:center; margin-top:20px;">No markers added yet.<br>Click the 📍 icon on any message to map your story.</div>';
            }
        }
    }

    jumpToMessage(targetIndex) {
        this.toggleDrawer(false);

        const boundary = this.app.state.contextBoundaryIndex;
        if (targetIndex <= boundary) {
            const visibleOOC = parseInt(this.app.settings?.visibleOutOfContext || 5);
            const requiredOffset = boundary - visibleOOC - targetIndex + 2; 
            
            if (requiredOffset > this.app.historyOffset) {
                this.app.historyOffset = requiredOffset;
            }
        }
        
        this.app.renderAll();

        setTimeout(() => {
            const wrapper = document.getElementById(`turn-wrapper-${targetIndex}`);
            if (wrapper) {
                this.app.container.scrollTo({
                    top: Math.max(0, wrapper.offsetTop - 10),
                    behavior: 'smooth'
                });
                wrapper.classList.add('pulse-highlight');
                setTimeout(() => wrapper.classList.remove('pulse-highlight'), 2000);
            }
        }, 100);
    }

    deleteMarkerFromDrawer(msgIdx, mk) {
        const msg = this.app.state.history[msgIdx];
        if (!msg || !msg.markers) return;

        if (!confirm(`Delete marker "${mk.name}" at Turn #${msgIdx + 1}?`)) return;

        // Check if there is an associated interval partner
        let partnerInfo = null;
        if (mk.intervalId && mk.intervalId !== 'manual') {
            for (let i = 0; i < this.app.state.history.length; i++) {
                const otherMsg = this.app.state.history[i];
                if (!otherMsg.markers) continue;
                const pIdx = otherMsg.markers.findIndex(m => m.intervalId === mk.intervalId && m.id !== mk.id);
                if (pIdx !== -1) {
                    partnerInfo = {
                        msgIndex: i,
                        markerIndex: pIdx,
                        marker: otherMsg.markers[pIdx]
                    };
                    break;
                }
            }
        }

        if (partnerInfo) {
            const partnerRole = partnerInfo.marker.type === 'interval_start' ? 'Start' : 'End';
            const partnerMsgNum = partnerInfo.msgIndex + 1;
            if (confirm(`This is part of an interval. Delete the matching ${partnerRole} marker at Turn #${partnerMsgNum} as well?`)) {
                const partnerMsg = this.app.state.history[partnerInfo.msgIndex];
                if (partnerMsg && partnerMsg.markers) {
                    partnerMsg.markers.splice(partnerInfo.markerIndex, 1);
                }
            }
        }

        // Remove the target marker
        const targetIdx = msg.markers.findIndex(m => m.id === mk.id);
        if (targetIdx !== -1) {
            msg.markers.splice(targetIdx, 1);
        }

        this.app.renderAll();
        this.app.autoSave();
        this.renderDrawer();
    }
}
// END FILE: js/ui/TimelineManager.js