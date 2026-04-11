import { settings } from '../state.js';

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
    constructor() {
        this.abortController = new AbortController();
        
        // Seed the content buffer if we forced the model to think
        this.rawContent = settings.forceThink ? "<think>\n" : "";
        this.apiReasoning = "";
        this.hasNativeReasoning = false; // Tracks if the API uses native reasoning fields
        
        this.finalContent = "";
        this.finalReasoning = "";
        
        this.startTime = Date.now();
        this.duration = 0;
        this.rawPayload = null;
    }

    cancel() {
        this.abortController.abort();
    }

    async *streamGeneration(messages) {
        const baseUrl = settings.apiUrl.replace(/\/$/, '');
        const endpoint = settings.useChatCompletions ? `${baseUrl}/chat/completions` : `${baseUrl}/completions`;

        const payload = {
            model: settings.model,
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

        if (settings.useChatCompletions) {
            payload.messages = messages;
        } else {
            payload.prompt = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant: ';
        }

        this.rawPayload = payload;

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

        try {
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
                            
                            // FIX: Check both common keys for native reasoning
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

                // If we received new tokens, parse the entire buffer idempotently
                if (hasUpdates) {
                    this.parseState();
                    yield { content: this.finalContent, reasoning: this.finalReasoning };
                }
            }
        } finally {
            reader.releaseLock();
            this.duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        }
    }

    // Runs over the accumulated string to safely extract thinking blocks
    parseState() {
        this.finalContent = this.rawContent;
        this.finalReasoning = this.apiReasoning;

        // If the API sends native reasoning, we don't need to regex parse the content.
        if (this.hasNativeReasoning) {
            // Strip the fake `<think>\n` we seeded if it's there, so it doesn't leak into the UI
            if (settings.forceThink) {
                this.finalContent = this.finalContent.replace(/^<think>\n/, "");
            }
        } else {
            // Fallback: The API doesn't use native reasoning fields (e.g. Ollama).
            // We must extract the <think> blocks manually.
            const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
            let match;
            let extractedReasoning = "";
            
            while ((match = thinkRegex.exec(this.rawContent)) !== null) {
                extractedReasoning += match[1];
            }

            if (extractedReasoning) {
                this.finalReasoning = extractedReasoning;
                // Strip the tags and reasoning from the final content
                this.finalContent = this.rawContent.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, "");
            }
        }

        // Final cleanup
        this.finalContent = this.finalContent.trimStart(); 
        this.finalReasoning = this.finalReasoning.trim();
    }
}