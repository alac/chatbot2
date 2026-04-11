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
        this.content = "";
        this.reasoning = "";
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
        let isThinking = settings.forceThink;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (const line of lines) {
                    if (line.trim() === "" || line.trim() === "data: [DONE]") continue;
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const delta = data.choices[0]?.delta || {};
                            const textChunk = delta.content || data.choices[0]?.text || "";
                            const reasonChunk = delta.reasoning_content || "";

                            // 1. Direct Reasoning from API (vLLM / O1)
                            if (reasonChunk) {
                                this.reasoning += reasonChunk;
                                yield { type: 'reasoning', text: reasonChunk };
                            }

                            // 2. Parse inline <think> tags (Ollama / DeepSeek-R1 raw)
                            if (textChunk) {
                                let chunkStr = textChunk;
                                
                                // State machine for inline tags
                                if (chunkStr.includes('<think>')) {
                                    isThinking = true;
                                    chunkStr = chunkStr.replace('<think>', '');
                                }
                                if (chunkStr.includes('</think>')) {
                                    isThinking = false;
                                    const parts = chunkStr.split('</think>');
                                    if (parts[0]) {
                                        this.reasoning += parts[0];
                                        yield { type: 'reasoning', text: parts[0] };
                                    }
                                    chunkStr = parts[1] || "";
                                }

                                if (isThinking) {
                                    this.reasoning += chunkStr;
                                    yield { type: 'reasoning', text: chunkStr };
                                } else if (chunkStr !== "") {
                                    this.content += chunkStr;
                                    yield { type: 'content', text: chunkStr };
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors on partial chunks
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
            this.duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        }
    }
}