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

        // Identify aggregated messages to skip (matching StoryState's payload logic)
        let skipIndices = new Set();
        for (let i = 0; i < state.history.length; i++) {
            if (state.history[i].role === 'aggregation' && state.history[i].meta && state.history[i].meta.aggregatedMsgIndex !== undefined) {
                skipIndices.add(state.history[i].meta.aggregatedMsgIndex);
            }
        }

        // Tally up messages fitting into the budget
        for (let i = state.history.length - 1; i >= 0; i--) {
            // Skip choices, hidden messages, and aggregated overrides
            if (state.history[i].role === 'choices' || state.history[i].isHidden || skipIndices.has(i)) continue;

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
