// BEGIN FILE: js/utils/TokenCalculator.js
export class TokenCalculator {
    /**
     * Calculates the current context usage and available token budget.
     */
    static getUsageStats(state, settings) {
        const charsRatio = parseFloat(settings.charsPerToken) || 4.0;
        
        const memCost = Math.ceil(state.systemPrompt.trim().length / charsRatio);
        const anCost = Math.ceil(state.anoteContent.trim().length / charsRatio);
        const sumCost = state.summary.trim() ? Math.ceil((state.summary.trim().length + 20) / charsRatio) : 0;
        
        const maxResp = parseInt(settings.maxTokens, 10);
        const maxContext = parseInt(settings.contextLength, 10);
        
        const unchanging = memCost + anCost + maxResp + sumCost;
        let budget = maxContext - unchanging;
        
        let summedCost = 0;
        let unsummedCost = 0;

        // Tally up messages fitting into the budget
        for (let i = state.history.length - 1; i >= 0; i--) {
            if (state.history[i].role === 'choices') continue;

            const T = Math.ceil(state.getContent(i).length / charsRatio);
            if (budget - T >= 0) {
                budget -= T;
                if (state.history[i].wasSummarized) {
                    summedCost += T;
                } else {
                    unsummedCost += T;
                }
            } else {
                break;
            }
        }

        const availableBudget = maxContext - unchanging;
        let percentageUsed = 0;
        if (availableBudget > 0) {
            percentageUsed = Math.min(100, Math.round((unsummedCost / availableBudget) * 100));
        }

        return {
            maxContext,
            maxResp,
            memCost,
            anCost,
            sumCost,
            unchangingCost: unchanging,
            availableBudget,
            summedCost,
            unsummedCost,
            percentageUsed
        };
    }
}