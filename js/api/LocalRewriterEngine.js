// BEGIN FILE: js/api/LocalRewriterEngine.js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

// Ensure it pulls from Hugging Face Hub, not local relative paths
env.allowLocalModels = false;

export class LocalRewriterEngine {
    constructor() {
        this.generator = null;
        this.isLoading = false;
        this.isReady = false;
    }

    async loadModel(modelId, progressCallback, statusCallback) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.isReady = false;
        
        try {
            statusCallback(`Initializing WebGPU for ${modelId}...`);
            // We use 'text2text-generation' for FLAN-T5 based models (like the deslop ones)
            this.generator = await pipeline('text2text-generation', modelId, {
                device: 'webgpu',
                dtype: 'q4', // Quantized for browser execution
                progress_callback: progressCallback
            });
            
            statusCallback(`Warming up shaders...`);
            await this.generator("unslop: test", { max_new_tokens: 1 });
            
            this.isReady = true;
            statusCallback(`Model loaded and ready.`);
        } catch (error) {
            console.error(error);
            statusCallback(`Error: ${error.message}`);
            this.generator = null;
        } finally {
            this.isLoading = false;
        }
    }

    async unload() {
        if (this.generator) {
            await this.generator.dispose();
            this.generator = null;
        }
        this.isReady = false;
    }

    async rewrite(text) {
        if (!this.isReady || !this.generator) {
            throw new Error("Model is not loaded.");
        }
        const prompt = `unslop: ${text}`;
        const result = await this.generator(prompt, {
            max_new_tokens: 128,
            do_sample: false
        });
        return result[0].generated_text;
    }
}
// END FILE: js/api/LocalRewriterEngine.js