export function diffWords(oldStr, newStr) {
    const oldWords = oldStr.split(/(\s+)/);
    const newWords = newStr.split(/(\s+)/);
    return computeDiff(oldWords, newWords);
}

export function diffLines(oldStr, newStr) {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');
    return computeDiff(oldLines, newLines, '\n');
}

function computeDiff(oldArr, newArr, joiner = '') {
    const matrix = Array(oldArr.length + 1).fill(null).map(() => Array(newArr.length + 1).fill(0));
    for (let i = 1; i <= oldArr.length; i++) {
        for (let j = 1; j <= newArr.length; j++) {
            if (oldArr[i - 1] === newArr[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    let i = oldArr.length, j = newArr.length;
    const diff = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
            diff.unshift({ type: 'equal', value: oldArr[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ type: 'insert', value: newArr[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diff.unshift({ type: 'delete', value: oldArr[i - 1] });
            i--;
        }
    }

    // Optional formatting block for HTML word diffs specifically
    if (joiner === '') {
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

    return diff;
}
