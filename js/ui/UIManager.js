// BEGIN FILE: js/ui/UIManager.js
import { settings } from '../state/AppSettings.js';
import { StoryState } from '../state/StoryState.js';
import { StorageManager } from '../storage/StorageManager.js';

// Newly extracted services
import { GenerationCoordinator } from '../services/GenerationCoordinator.js';
import { TurnRenderer } from './TurnRenderer.js';

// Existing Sub-Managers
import { DraftSwitcher } from './DraftSwitcher.js';
import { ApplyEditsManager } from './ApplyEditsManager.js';
import { BrainstormManager } from './BrainstormManager.js';
import { SummaryManager } from './SummaryManager.js';
import { ToolsManager } from './ToolsManager.js';
import { QuickRepliesManager } from './QuickRepliesManager.js';
import { DraftMergeManager } from './DraftMergeManager.js';
import { MemoryHistoryManager } from './MemoryHistoryManager.js';
import { NotesManager } from './NotesManager.js';
import { SurgicalEditManager } from './SurgicalEditManager.js';
import { BatchEditManager } from './BatchEditManager.js';
import { SelectionToolbarManager } from './SelectionToolbarManager.js';
import { RewriterManager } from './RewriterManager.js';
import { FlagCollectorManager } from './FlagCollectorManager.js';
import { TrashExplorerManager } from './TrashExplorerManager.js';
import { EditLogManager } from './EditLogManager.js';
import { TimelineManager } from './TimelineManager.js';
import { TimelineGeneratorManager } from './TimelineGeneratorManager.js';
import { DirectorManager } from './DirectorManager.js';
import { ScrollNavigator } from './ScrollNavigator.js';
import { CloudSyncUI } from './CloudSyncUI.js';
import { SlotManager } from './SlotManager.js';
import { RemoteManagerUI } from './RemoteManagerUI.js';
import { ImageGenManager } from './ImageGenManager.js';
import { AvatarManager } from './AvatarManager.js';
import { NanoGPTUsage } from './NanoGPTUsage.js';
import { RequestTracker } from './RequestTracker.js';

export class UIManager {
    constructor() {
        this.events = new EventTarget();
        this.state = new StoryState(this.events);
        this.requestTracker = new RequestTracker(this);
        this.storage = new StorageManager();
        
        // State variables shared across managers
        this._activeBatch = null; // Private backing variable
        this.activeSlot = '1';
        this.activeSlotName = `Slot 1`;
        this.activeSlotDesc = ``;
        this.batchTimerInterval = null;
        this.batchStartTime = 0;
        this.historyOffset = 0;
        this.isUserScrolledUp = false;
        this.overrideNextSend = null;
        
        this.container = document.getElementById('output-container');
        this.input = document.getElementById('user-input');

        // Instantiate core architectural splits
        this.generationCoordinator = new GenerationCoordinator(this);
        this.turnRenderer = new TurnRenderer(this);

        // Instantiate sub-managers
        this.draftSwitcher = new DraftSwitcher(this);
        this.applyEditsManager = new ApplyEditsManager(this);
        this.brainstormManager = new BrainstormManager(this);
        this.summaryManager = new SummaryManager(this);
        this.toolsManager = new ToolsManager(this);
        this.quickRepliesManager = new QuickRepliesManager(this);
        this.draftMergeManager = new DraftMergeManager(this);
        this.memoryHistoryManager = new MemoryHistoryManager(this);
        this.notesManager = new NotesManager(this);
        this.surgicalEditManager = new SurgicalEditManager(this);
        this.batchEditManager = new BatchEditManager(this);
        this.selectionToolbarManager = new SelectionToolbarManager(this);
        this.rewriterManager = new RewriterManager(this);
        this.flagCollectorManager = new FlagCollectorManager(this);
        this.trashExplorerManager = new TrashExplorerManager(this);
        this.editLogManager = new EditLogManager(this);
        this.cloudSyncUI = new CloudSyncUI(this);
        this.slotManager = new SlotManager(this);
        this.remoteManagerUI = new RemoteManagerUI(this);

        this.imageGenManager = new ImageGenManager(this);
        this.avatarManager = new AvatarManager(this);
        this.nanoGPTUsage = new NanoGPTUsage();
        this.timelineManager = new TimelineManager(this);
        this.timelineGeneratorManager = new TimelineGeneratorManager(this);
        this.directorManager = new DirectorManager(this);
        this.scrollNavigator = new ScrollNavigator(this);

        this.bindEvents();
        this.initApp();
    }

    // --- PROXY METHODS TO PREVENT BREAKING OTHER MANAGERS ---
    
    get activeBatch() { return this._activeBatch; }
    set activeBatch(val) { this._activeBatch = val; }

    renderAll() { this.turnRenderer.renderAll(); }
    scrollToBottom() { this.turnRenderer.scrollToBottom(); }
    
    handleSend(isRetry, targetIndex) { this.generationCoordinator.handleSend(isRetry, targetIndex); }
    generateAdditionalDrafts(msgIndex, modelList) { this.generationCoordinator.generateAdditionalDrafts(msgIndex, modelList); }

    // --------------------------------------------------------

    async initApp() {
        await this.storage.init();
        const lastSlot = localStorage.getItem('last_active_slot') || '1';
        await this.loadStateFromSlot(lastSlot);
        
        const fab = document.getElementById('btn-jump-bottom');
        this.container.addEventListener('scroll', () => {
            this.isUserScrolledUp = (this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight) > 50;
            if (this.isUserScrolledUp) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        });
        fab.addEventListener('click', () => {
            this.isUserScrolledUp = false;
            this.scrollToBottom();
        });

        this.summaryManager.updateSummaryMeter();
        this.nanoGPTUsage.update();

        const hapticsEl = document.getElementById('set-enable-haptics');
        if (hapticsEl) {
            hapticsEl.checked = !!settings.enableHaptics;
            hapticsEl.addEventListener('change', (e) => {
                settings.enableHaptics = e.target.checked;
                settings.save();
            });
        }
    }

    bindEvents() {
        // Delegate network events to the Coordinator
        document.getElementById('btn-send').addEventListener('click', () => this.generationCoordinator.handleSend());
        document.getElementById('btn-retry').addEventListener('click', () => this.generationCoordinator.handleRetry());
        document.getElementById('btn-abort').addEventListener('click', () => this.generationCoordinator.handleAbort());
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { 
                e.preventDefault(); 
                this.generationCoordinator.handleSend(); 
            }
        });

        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = (this.input.scrollHeight) + 'px';
        });

        document.getElementById('btn-more-menu').addEventListener('click', () => {
            document.getElementById('quick-menu').classList.toggle('hidden');
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            this.state.undo()
        });
        document.getElementById('btn-redo').addEventListener('click', () => {
            this.state.redo()
        });

        document.getElementById('btn-edit-cancel').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));
        document.getElementById('btn-edit-save').addEventListener('click', () => {
            const idx = parseInt(document.getElementById('btn-edit-save').dataset.idx);
            const newContent = document.getElementById('edit-message-content').value;
            const msg = this.state.history[idx];
            if (!msg) return;

            if (msg.role === 'aggregation') {
                if (msg.meta.displayInput === newContent) {
                    document.getElementById('edit-modal').classList.add('hidden');
                    return;
                }
                const oldInstructions = msg.meta.displayInput;
                msg.meta.displayInput = newContent;
                if (oldInstructions && msg.drafts[0]?.content) {
                    msg.drafts[0].content = msg.drafts[0].content.replaceAll(oldInstructions, newContent);
                }
                this.state.redoStack = [];

                // Manual rerender/save since we're not using a storyState helper
                this.renderAll();
                this.autoSave();
            } else {
                const currentContent = this.state.getContent(idx);
                if (newContent === currentContent) {
                    document.getElementById('edit-modal').classList.add('hidden');
                    return;
                }
                this.state.editTurn(idx, newContent);
            }
            
            document.getElementById('edit-modal').classList.add('hidden');
        });
        document.getElementById('btn-close-prompt').addEventListener('click', () => document.getElementById('prompt-modal').classList.add('hidden'));
        document.getElementById('btn-close-usage').addEventListener('click', () => document.getElementById('usage-modal').classList.add('hidden'));
        
        // Inject Turn Bindings
        document.getElementById('btn-inject-cancel').addEventListener('click', () => document.getElementById('inject-modal').classList.add('hidden'));
        document.getElementById('btn-close-inject').addEventListener('click', () => document.getElementById('inject-modal').classList.add('hidden'));
        document.getElementById('btn-inject-apply').addEventListener('click', () => this.handleInjectSave());
        document.getElementById('btn-inject-prev-toggle').addEventListener('click', () => document.getElementById('inject-prev-context').classList.toggle('hidden'));
        document.getElementById('btn-inject-next-toggle').addEventListener('click', () => document.getElementById('inject-next-context').classList.toggle('hidden'));

        this.setupStateListeners();
    }

    setupStateListeners() {
        // 1. UI RENDER DEBOUNCER (Using requestAnimationFrame)
        let isRenderPending = false;
        
        this.events.addEventListener('state:change', () => {
            if (isRenderPending) return; // If already queued, ignore
            
            isRenderPending = true;
            
            // requestAnimationFrame waits until the JS thread is done, 
            // then runs exactly ONCE right before the screen repaints (max ~16ms).
            requestAnimationFrame(() => {
                isRenderPending = false;
                
                this.turnRenderer.renderAll();
                this.summaryManager.updateSummaryMeter();
            });
        });

        // 2. STORAGE DEBOUNCER (Using setTimeout)
        let saveTimeout = null;
        
        this.events.addEventListener('state:change', () => {
            // Clear the previous timer if another change happens quickly
            if (saveTimeout) clearTimeout(saveTimeout);
            
            // Wait 500ms after the LAST state change before writing to disk
            saveTimeout = setTimeout(() => {
                this.autoSave();
            }, 500); 
        });
    }

    openInjectModal(index) {
        this.activeInjectIndex = index;
        document.getElementById('inject-modal-title').textContent = `Inject Turn Below #${index + 1}`;
        document.getElementById('inject-textarea').value = '';
        document.getElementById('inject-role-select').value = 'assistant';

        const prevContext = document.getElementById('inject-prev-context');
        const nextContext = document.getElementById('inject-next-context');

        prevContext.classList.add('hidden');
        nextContext.classList.add('hidden');

        if (index >= 0 && this.state.history[index]) {
            prevContext.textContent = this.state.getContent(index);
        } else {
            prevContext.textContent = "(No previous message)";
        }

        if (index + 1 < this.state.history.length && this.state.history[index + 1]) {
            nextContext.textContent = this.state.getContent(index + 1);
        } else {
            nextContext.textContent = "(No next message)";
        }

        document.getElementById('inject-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('inject-textarea').focus(), 50);
    }

    handleInjectSave() {
        const content = document.getElementById('inject-textarea').value;
        const role = document.getElementById('inject-role-select').value;
        
        if (!content.trim()) {
            alert("Content cannot be empty.");
            return;
        }

        this.state.injectTurn(this.activeInjectIndex, role, content);
        
        document.getElementById('inject-modal').classList.add('hidden');
    }

    getBaseTitle() {
        return `${this.activeSlotName || `Slot ${this.activeSlot}`}`;
    }

    updateDocumentTitle() {
        this.requestTracker.updateTitle();
    }

    async autoSave() {
        if (this.directorManager && this.directorManager.isActive) return;
        await this.storage.saveSlot(this.activeSlot, this.activeSlotName, this.activeSlotDesc, this.state.exportData());
        localStorage.setItem('last_active_slot', this.activeSlot);
        if (this.slotManager) this.slotManager.refreshSlotList();
    }

    async loadStateFromSlot(id) {
        this.activeSlot = id;
        localStorage.setItem('last_active_slot', id);
        
        const slot = await this.storage.loadSlot(id);
        if (slot) {
            this.activeSlotName = slot.name || `Slot ${id}`;
            this.activeSlotDesc = slot.description || ``;
            if (slot.data) {
                this.state.loadFromData(slot.data);
                document.getElementById('set-display-mode').value = settings.displayMode;
                if (document.getElementById('lbl-active-sum-prompt')) {
                    document.getElementById('lbl-active-sum-prompt').textContent = this.state.selectedAutoSumPromptTitle;
                }
            } else {
                this.state.clear(true);
            }
        } else {
            this.activeSlotName = `Slot ${id}`;
            this.activeSlotDesc = ``;
            this.state.clear(true); 
        }
        this.historyOffset = 0;
        this.state.buildPromptPayload();
        if (this.avatarManager) this.avatarManager.updateAvatarDisplay();
        this.updateDocumentTitle();
        this.renderAll();
    }
}
// END FILE: js/ui/UIManager.js