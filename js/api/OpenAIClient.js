import { settings } from '../state/AppSettings.js';

export class OpenAIClient {
    static async fetchModels() {
        const url = `${settings.apiUrl.replace(/\/$/, '')}/models`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${settings.apiKey}` }
        });
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const data = await response.json();
        return data.data || data;
    }
}

export class GenerationJob {
    constructor(modelOverride = null) {
        this.abortController = new AbortController();
        this.model = modelOverride || settings.model;
        
        this.rawContent = settings.forceThink ? "<think>\n" : "";
        this.apiReasoning = "";
        this.hasNativeReasoning = false;
        
        this.finalContent = "";
        this.finalReasoning = "";
        this.status = "streaming";
        this.startTime = Date.now();
        this.duration = 0;
        this.rawPayload = null;
    }

    cancel() {
        this.abortController.abort();
    }

    // Uses callback instead of async generator for easier parallel management
    async start(messages, onUpdate) {
        const baseUrl = settings.apiUrl.replace(/\/$/, '');
        const endpoint = settings.useChatCompletions ? `${baseUrl}/chat/completions` : `${baseUrl}/completions`;

        const payload = {
            model: this.model,
            temperature: parseFloat(settings.temperature),
            max_tokens: parseInt(settings.maxTokens),
            top_p: parseFloat(settings.topP),
            min_p: parseFloat(settings.minP),
            top_k: parseInt(settings.topK),
            top_a: parseFloat(settings.topA),
            typical_p: parseFloat(settings.typical),
            tfs_z: parseFloat(settings.tfs),
            repetition_penalty: parseFloat(settings.repPen),
            stream: true
        };

        const stopTokens = settings.stopSequences.split(',').map(s => s.trim()).filter(s => s);
        if (stopTokens.length > 0) {
            payload.stop = stopTokens;
        }

        if (settings.useChatCompletions) {
            payload.messages = messages;
        } else {
            payload.prompt = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant: ';
        }

        this.rawPayload = payload;

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify(payload),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`API Error ${response.status}: ${err}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                let hasUpdates = false;

                for (const line of lines) {
                    if (line.trim() === "" || line.trim() === "data: [DONE]") continue;
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const delta = data.choices[0]?.delta || {};
                            
                            const textChunk = delta.content || data.choices[0]?.text || "";
                            const reasonChunk = delta.reasoning_content || delta.reasoning || "";

                            if (reasonChunk) {
                                this.apiReasoning += reasonChunk;
                                this.hasNativeReasoning = true;
                                hasUpdates = true;
                            }
                            if (textChunk) {
                                this.rawContent += textChunk;
                                hasUpdates = true;
                            }
                        } catch (e) {
                            // Ignore parse errors on partial JSON chunks
                        }
                    }
                }

                if (hasUpdates) {
                    this.parseState();
                    onUpdate();
                }
            }
            this.status = "done";
        } catch (err) {
            if (err.name !== "AbortError") {
                this.finalContent += `\n[Error: ${err.message}]`;
            }
            this.status = "error";
        } finally {
            this.duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
            this.parseState();
            onUpdate();
        }
    }

    parseState() {
        this.finalContent = this.rawContent;
        this.finalReasoning = this.apiReasoning;

        if (this.hasNativeReasoning) {
            if (settings.forceThink) this.finalContent = this.finalContent.replace(/^<think>\n/, "");
        } else {
            const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
            let match;
            let extractedReasoning = "";
            
            while ((match = thinkRegex.exec(this.rawContent)) !== null) {
                extractedReasoning += match[1];
            }

            if (extractedReasoning) {
                this.finalReasoning = extractedReasoning;
                this.finalContent = this.rawContent.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, "");
            }
        }
        this.finalContent = this.finalContent.trimStart(); 
        this.finalReasoning = this.finalReasoning.trim();
    }
}

export class ParallelGenerationBatch {
    constructor(messages, count, overrides) {
        this.jobs = [];
        for(let i=0; i<count; i++) {
            let mod = settings.model;
            if (i > 0 && overrides[i-1] && overrides[i-1].enabled && overrides[i-1].model) {
                mod = overrides[i-1].model;
            }
            this.jobs.push(new GenerationJob(mod));
        }
        this.messages = messages;
    }

    cancelAll() {
        this.jobs.forEach(j => j.cancel());
    }

    async startAll(onUpdateCallback) {
        const promises = this.jobs.map((job, index) => {
            return job.start(this.messages, () => {
                // When any job updates, fire the master callback with index and full state
                onUpdateCallback(index, {
                    model: job.model,
                    content: job.finalContent,
                    reasoning: job.finalReasoning,
                    status: job.status,
                    duration: job.duration
                });
            });
        });
        await Promise.allSettled(promises);
    }
}
