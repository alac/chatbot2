// BEGIN FILE: js/ui/TimelineManager.js
export class TimelineManager {
    constructor(app) {
        this.app = app;
        this.activeMsgIndex = -1;
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
                        <input type="text" id="marker-tags-input" placeholder="Tags (comma separated)">
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

        // 3. Inject Toggle Button into Main Header
        const navControls = document.querySelector('header .nav-controls');
        if (navControls) {
            const btn = document.createElement('button');
            btn.innerHTML = '📑';
            btn.title = "Timeline";
            btn.className = 'secondary';
            btn.addEventListener('click', () => this.toggleDrawer());
            navControls.insertBefore(btn, navControls.firstChild);
        }
    }

    bindEvents() {
        document.getElementById('timeline-overlay').addEventListener('click', () => this.toggleDrawer(false));
        document.getElementById('btn-close-timeline').addEventListener('click', () => this.toggleDrawer(false));
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

        document.getElementById('btn-close-open-interval').addEventListener('click', () => {
            this.renderOpenIntervals();
            document.getElementById('marker-actions-row').classList.add('hidden');
            document.getElementById('marker-close-interval-form').classList.remove('hidden');
        });
        document.getElementById('btn-cancel-close-interval').addEventListener('click', () => {
            document.getElementById('marker-close-interval-form').classList.add('hidden');
            document.getElementById('marker-actions-row').classList.remove('hidden');
        });

        document.getElementById('btn-save-create-marker').addEventListener('click', () => this.saveNewMarker());
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
            
            const info = document.createElement('div');
            const icon = mk.type === 'interval_start' ? '▶' : mk.type === 'interval_end' ? '⏹' : '📍';
            info.innerHTML = `<strong>${icon} ${mk.name}</strong>`;
            if (mk.tags && mk.tags.length > 0) {
                info.innerHTML += `<br><span style="font-size:0.8em; color:var(--text-muted);">Tags: ${mk.tags.join(', ')}</span>`;
            }

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

            card.appendChild(info);
            card.appendChild(btnDel);
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
            marker.intervalId = 'manual'; // User can link it later or it acts as a floating end
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

        // 1. Gather all interval starts & ends
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

        // 2. Filter unclosed that started BEFORE OR ON the active index
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

    // --- DRAWER TIMELINE LOGIC ---

    renderDrawer() {
        const list = document.getElementById('timeline-list');
        list.innerHTML = '';

        let hasMarkers = false;

        this.app.state.history.forEach((msg, idx) => {
            if (!msg.markers || msg.markers.length === 0) return;
            hasMarkers = true;

            msg.markers.forEach(mk => {
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

                if (mk.tags && mk.tags.length > 0) {
                    const tagDiv = document.createElement('div');
                    tagDiv.className = 'timeline-item-tags';
                    mk.tags.forEach(t => {
                        const pill = document.createElement('span');
                        pill.className = 'tag-pill';
                        pill.textContent = t;
                        tagDiv.appendChild(pill);
                    });
                    item.appendChild(tagDiv);
                }

                list.appendChild(item);
            });
        });

        if (!hasMarkers) {
            list.innerHTML = '<div style="color:var(--text-muted); text-align:center; margin-top:20px;">No markers added yet.<br>Click the 📍 icon on any message to map your story.</div>';
        }
    }

    jumpToMessage(targetIndex) {
        this.toggleDrawer(false);

        const boundary = this.app.state.contextBoundaryIndex;
        // If the target index is outside the currently rendered context
        if (targetIndex <= boundary) {
            const visibleOOC = parseInt(this.app.settings?.visibleOutOfContext || 5);
            // requiredOffset calculates how far back we need to push the historyOffset
            // to ensure `targetIndex >= boundary - visibleOOC - historyOffset`
            const requiredOffset = boundary - visibleOOC - targetIndex + 2; 
            
            if (requiredOffset > this.app.historyOffset) {
                this.app.historyOffset = requiredOffset;
            }
        }
        
        // Force a re-render so the DOM node is guaranteed to exist
        this.app.renderAll();

        setTimeout(() => {
            const wrapper = document.getElementById(`turn-wrapper-${targetIndex}`);
            if (wrapper) {
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                wrapper.classList.add('pulse-highlight');
                setTimeout(() => wrapper.classList.remove('pulse-highlight'), 2000);
            }
        }, 100);
    }
}
// END FILE: js/ui/TimelineManager.js