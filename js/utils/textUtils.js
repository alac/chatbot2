// BEGIN FILE: js/utils/textUtils.js
export function getCharOffsetsFromBlocks(rawBlocks, startBlockIdx, endBlockIdx, intraStart = 0, intraEnd = 0) {
    let baseStart = 0;
    for (let i = 0; i < startBlockIdx; i++) {
        baseStart += rawBlocks[i].length;
    }
    
    let baseEnd = 0;
    for (let i = 0; i < endBlockIdx; i++) {
        baseEnd += rawBlocks[i].length;
    }
    
    return { 
        startChar: baseStart + intraStart, 
        endChar: baseEnd + intraEnd 
    };
}

export function expandToSentenceBoundaries(fullText, startChar, endChar) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(fullText));
    
    let expandedStart = startChar;
    let expandedEnd = endChar;
    
    for (const seg of segments) {
        const segStart = seg.index;
        const segEnd = seg.index + seg.segment.length;
        
        // Expand start to sentence start
        if (segStart <= startChar && segEnd > startChar) {
            expandedStart = segStart;
        }
        // Expand end to sentence end
        if (segStart < endChar && segEnd >= endChar) {
            expandedEnd = segEnd;
        }
    }
    
    return {
        expandedText: fullText.substring(expandedStart, expandedEnd),
        startIndex: expandedStart,
        endIndex: expandedEnd
    };
}
// END FILE: js/utils/textUtils.js