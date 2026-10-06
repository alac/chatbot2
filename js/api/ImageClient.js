import { settings } from '../state/AppSettings.js';

export class ImageClient {
    static async generateImagePrompt(messages) {
        const baseUrl = settings.apiUrl.replace(/\/$/, '');
        const endpoint = settings.useChatCompletions ? `${baseUrl}/chat/completions` : `${baseUrl}/completions`;
        
        const payload = {
            model: settings.model,
            messages: messages,
            temperature: 0.7,
            response_format: { type: "json_object" }
        };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Director API Error: ${response.status}`);
        const data = await response.json();
        return data.choices[0].message.content;
    }

    static async generateImage(prompt, model, abortSignal) {
        const baseUrl = settings.imgApiUrl.replace(/\/$/, '');
        const endpoint = `${baseUrl}/images/generations`;

        const payload = {
            model: model,
            prompt: prompt,
            n: 1,
            response_format: 'b64_json' // Force b64 to prevent canvas CORS poisoning downstream
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.imgApiKey}`
            },
            body: JSON.stringify(payload),
            signal: abortSignal
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Image API Error: ${response.status} ${errText}`);
        }
        const data = await response.json();
        
        if (data.data && data.data[0]) {
            if (data.data[0].b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
            if (data.data[0].url) return data.data[0].url; 
        }
        throw new Error('No image returned from API');
    }
}