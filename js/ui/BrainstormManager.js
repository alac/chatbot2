// BEGIN FILE: js/ui/BrainstormManager.js
import { settings } from '../state/AppSettings.js';
import { ParallelGenerationBatch } from '../api/OpenAIClient.js';

export class BrainstormManager {
    constructor(app) {
        this.app = app;
        this.moodTags = [];
        this.hardcodedMoods = [
            'Action-packed', 'Aggressive', 'Alien', 'Angsty', 'Bleak', 'Chaotic', 'Cheerful', 
            'Cinematic', 'Comedic', 'Cozy', 'Creepy', 'Cyberpunk', 'Dark', 'Desperate', 
            'Dramatic', 'Dreamy', 'Eerie', 'Epic', 'Euphoric', 'Fast-paced', 'Flirty', 
            'Gloomy', 'Gothic', 'Gritty', 'Heartwarming', 'Heroic', 'Hopeful', 'Horror', 
            'Intense', 'Lighthearted', 'Melancholic', 'Mysterious', 'Noir', 'Nostalgic', 
            'Ominous', 'Optimistic', 'Peaceful', 'Philosophical', 'Playful', 'Romantic', 
            'Sci-Fi', 'Sensual', 'Sexy', 'Serious', 'Slow-burn', 'Steampunk', 'Suspenseful', 
            'Tense', 'Tragic', 'Whimsical', 'Wholesome'
        ];

        this.bindEvents();
    }

    bindEvents() {
        // Open Modal
        document.getElementById('btn-generate-choices').addEventListener('click', () => {
            document.getElementById('quick-menu').classList.add('hidden');
            document.getElementById('brainstorm-modal').classList.remove('hidden');
        });
        
        // Open Choices Settings
        document.getElementById('btn-choices-settings').addEventListener('click', () => {
            if (window.settingsUI) window.settingsUI.populateChoicesUI();
            document.getElementById('choices-settings-modal').classList.remove('hidden');
        });

        document.getElementById('btn-close-brainstorm').addEventListener('click', () => {
            document.getElementById('brainstorm-modal').classList.add('hidden');
        });
        
        // Preset Choices
        document.getElementById('btn-bs-preset').addEventListener('click', () => {
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration();
        });

        // Mood Logic
        const moodInput = document.getElementById('mood-input');
        moodInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = moodInput.value.trim().replace(/,/g, '');
                if (val && !this.moodTags.includes(val)) {
                    this.moodTags.push(val);
                    this.renderMoodTags();
                }
                moodInput.value = '';
            }
        });
        
        document.getElementById('btn-mood-random').addEventListener('click', () => {
            let available = this.hardcodedMoods.filter(m => !this.moodTags.includes(m));
            for (let i = 0; i < 3; i++) {
                if (available.length === 0) break;
                const idx = Math.floor(Math.random() * available.length);
                this.moodTags.push(available[idx]);
                available.splice(idx, 1);
            }
            this.renderMoodTags();
        });
        
        document.getElementById('btn-bs-mood').addEventListener('click', () => {
            if (moodInput.value.trim()) {
                this.moodTags.push(moodInput.value.trim());
                moodInput.value = '';
                this.renderMoodTags();
            }
            if (this.moodTags.length === 0) {
                document.getElementById('btn-mood-random').click();
            }
            const prompt = `Generate 5 ideas for what happens next matching the following styles: ${this.moodTags.join(', ')}.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        // Advanced Prompts
        document.getElementById('btn-bs-shift').addEventListener('click', () => {
            const prompt = `First, categorize the current scene along these axes: Mood/Tone, Emotional Charge, Narrative Pace/Tension, Agency/Power Balance.\nNow, choose **one** axis to deliberately shift to an adjacent category (e.g., Mood from Lighthearted to Eerie/Dramatic). Then generate 5 ideas for what happens next; for each briefly justify why that shift could naturally arise from the established story elements.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-tension').addEventListener('click', () => {
            const prompt = `Give me 3 options for what might happen next—one that raises tension, one that deepens character, and one that introduces a new element.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-reversal').addEventListener('click', () => {
            const char = document.getElementById('reversal-char-input').value.trim() || 'a character';
            const prompt = `Give me 5 ideas for how ${char} could do the opposite of what they would normally do, while providing a justification for each one.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });

        document.getElementById('btn-bs-storm').addEventListener('click', () => {
            const prompt = `Give me 5 ideas for an overarching event that we can introduce that would provide a medium term goal to the story.`;
            document.getElementById('brainstorm-modal').classList.add('hidden');
            this.startChoicesGeneration(prompt);
        });
    }

    renderMoodTags() {
        const container = document.getElementById('mood-tags-container');
        container.innerHTML = '';
        this.moodTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'mood-pill';
            const text = document.createElement('span');
            text.textContent = tag;
            const btn = document.createElement('button');
            btn.innerHTML = '&times;';
            btn.onclick = () => {
                this.moodTags = this.moodTags.filter(t => t !== tag);
                this.renderMoodTags();
            };
            pill.appendChild(text);
            pill.appendChild(btn);
            container.appendChild(pill);
        });
    }

    async startChoicesGeneration(promptOverride = null) {
        if (this.app.activeBatch) return;

        document.getElementById('quick-menu').classList.add('hidden');
        document.getElementById('btn-send').classList.add('hidden');
        document.getElementById('btn-retry').classList.add('hidden');
        document.getElementById('btn-abort').classList.remove('hidden');
        this.app.isUserScrolledUp = false;

        const payloadObj = this.app.state.buildPromptPayload();
        
        let finalPrompt = promptOverride || settings.activeChoicePromptText;
        if (!finalPrompt.includes('<choice>')) {
            finalPrompt += '\n\nWrap each option in <choice> and </choice> tags.';
        }

        payloadObj.messages.push({ role: 'user', content: finalPrompt });

        const count = settings.choiceParallelEnabled ? parseInt(settings.choiceParallelCount) : 1;
        this.app.activeBatch = new ParallelGenerationBatch(payloadObj.messages, count, settings.choiceParallelOverrides);
        
        const newIdx = this.app.state.history.length;
        this.app.state.addBatchTurn(count, 'choices');
        this.app.appendTurnToDOM('choices', newIdx);

        if (this.app.batchTimerInterval) clearInterval(this.app.batchTimerInterval);
        this.app.batchStartTime = Date.now();
        this.app.batchTimerInterval = setInterval(() => {
            if (!this.app.activeBatch || this.app.activeBatch.isFinished) {
                clearInterval(this.app.batchTimerInterval);
                return;
            }
            const elapsed = ((Date.now() - this.app.batchStartTime)/1000).toFixed(1);
            this.app.activeBatch.jobs.forEach((job, i) => {
                if (job.status === 'streaming') {
                    const timerEl = document.getElementById(`choice-timer-${newIdx}-${i}`);
                    if (timerEl) timerEl.textContent = `(${elapsed}s)`;
                }
            });
        }, 100);

        try {
            await this.app.activeBatch.startAll((draftIdx, data) => {
                this.app.state.updateBatchDraft(newIdx, draftIdx, data);
                
                const iconMap = { 'done':'✔️', 'error':'❌', 'streaming':'🕒' };
                const iconEl = document.getElementById(`choice-icon-${newIdx}-${draftIdx}`);
                if (iconEl) iconEl.textContent = iconMap[data.status] || '';
                
                if (data.status !== 'streaming') {
                    const timerEl = document.getElementById(`choice-timer-${newIdx}-${draftIdx}`);
                    if (timerEl) timerEl.textContent = `(${data.duration}s)`;
                }
                if (!this.app.isUserScrolledUp) this.app.scrollToBottom();
            });
        } finally {
            if (this.app.batchTimerInterval) clearInterval(this.app.batchTimerInterval);
            this.app.activeBatch = null;

            const msg = this.app.state.history[newIdx];
            const choicesPool = [];
            const regex = /<choice>([\s\S]*?)<\/choice>/gi;
            
            msg.drafts.forEach(draft => {
                let match;
                while ((match = regex.exec(draft.content)) !== null) {
                    if (match[1].trim()) choicesPool.push(match[1].trim());
                }
            });

            if (choicesPool.length === 0) {
                msg.extractedChoices = ["Error: No <choice> tags found in AI response. Try editing the Choice Prompt to explicitly request <choice> tags."];
            } else {
                msg.extractedChoices = [...new Set(choicesPool)];
            }

            document.getElementById('btn-abort').classList.add('hidden');
            document.getElementById('btn-send').classList.remove('hidden');
            document.getElementById('btn-retry').classList.remove('hidden');
            
            const oldWrapper = document.getElementById(`turn-wrapper-${newIdx}`);
            if (oldWrapper) oldWrapper.remove();
            
            this.app.appendTurnToDOM('choices', newIdx);
            if (!this.app.isUserScrolledUp) this.app.scrollToBottom();
            this.app.autoSave();
        }
    }
}