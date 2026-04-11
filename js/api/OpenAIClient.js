import { settings } from '../state/AppSettings.js';

export class OpenAIClient {
    
    // Fetches models from the compatible endpoint
    static async fetchModels() {
        const url = `${settings.apiUrl.replace(/\/$/, '')}/models`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`
            }
        });

        if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
        const data = await response.json();
        return data.data || data; // Handle OpenAI standard {"data": [...]} or raw arrays
    }
}

export class GenerationJob {
    constructor() {
        this.abortController = new AbortController();
        this.accumulatedText = "";
    }

    cancel() {
        this.abortController.abort();
    }

    async *streamGeneration(messages) {
        // Construct endpoint based on Chat vs Completion toggle
        const baseUrl = settings.apiUrl.replace(/\/$/, '');
        const endpoint = settings.useChatCompletions 
            ? `${baseUrl}/chat/completions` 
            : `${baseUrl}/completions`;

        // Map expansive samplers. (OpenAI ignores unknowns, OpenRouter/Kobold accepts them)
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
            // Flatten messages into a raw prompt if using standard /completions
            payload.prompt = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant: ';
        }

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
                buffer = lines.pop(); // Keep incomplete line

                for (const line of lines) {
                    if (line.trim() === "" || line.trim() === "data: [DONE]") continue;
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            // Handle both /chat/completions (delta.content) and /completions (text) shapes
                            const token = data.choices[0]?.delta?.content || data.choices[0]?.text || "";
                            if (token) {
                                this.accumulatedText += token;
                                yield token;
                            }
                        } catch (e) {
                            console.warn("Parse error on chunk:", line);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}