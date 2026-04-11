export function diffWords(oldStr, newStr) {
    const oldWords = oldStr.split(/(\s+)/);
    const newWords = newStr.split(/(\s+)/);
    
    const matrix = Array(oldWords.length + 1).fill(null).map(() => Array(newWords.length + 1).fill(0));
    for (let i = 1; i <= oldWords.length; i++) {
        for (let j = 1; j <= newWords.length; j++) {
            if (oldWords[i - 1] === newWords[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    let i = oldWords.length, j = newWords.length;
    const diff = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            diff.unshift({ type: 'equal', value: oldWords[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ type: 'insert', value: newWords[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diff.unshift({ type: 'delete', value: oldWords[i - 1] });
            i--;
        }
    }

    let oldHtml = '', newHtml = '';
    diff.forEach(part => {
        const safeVal = part.value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (part.type === 'equal') {
            oldHtml += safeVal; newHtml += safeVal;
        } else if (part.type === 'delete') {
            oldHtml += `<del>${safeVal}</del>`;
        } else if (part.type === 'insert') {
            newHtml += `<ins>${safeVal}</ins>`;
        }
    });

    return { oldHtml, newHtml };
}