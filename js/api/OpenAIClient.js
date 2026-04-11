import { settings } from '../state/AppSettings.js';

export class GenerationJob {
    constructor() {
        this.abortController = new AbortController();
        this.accumulatedText = "";
        this.isDone = false;
    }

    cancel() {
        this.abortController.abort();
    }

    // Returns an Async Generator yielding chunks of text
    async *streamChatCompletions(messages) {
        const payload = {
            model: settings.model,
            messages: messages,
            temperature: parseFloat(settings.temperature),
            max_tokens: parseInt(settings.maxTokens),
            stream: true
        };

        const response = await fetch(settings.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
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
                
                // Keep the last incomplete line in the buffer
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim() === "") continue;
                    if (line.trim() === "data: [DONE]") {
                        this.isDone = true;
                        return;
                    }
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6);
                        try {
                            const data = JSON.parse(dataStr);
                            const token = data.choices[0]?.delta?.content || "";
                            if (token) {
                                this.accumulatedText += token;
                                yield token;
                            }
                        } catch (e) {
                            console.warn("Failed to parse SSE chunk", line, e);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}