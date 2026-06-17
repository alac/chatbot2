// BEGIN FILE: js/utils/DiceRoller.js
export class DiceRoller {
    /**
     * Parses notation and rolls dice.
     * @param {string} notation - Format like "2d6" or "1d20+5"
     * @returns {Object} { rolls, modifierSign, modifier, finalTotal, message }
     */
    static roll(notation) {
        if (!notation) notation = "1d20";
        
        const match = notation.match(/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
        if (!match) {
            throw new Error("Invalid dice notation. Use format XdY or XdY+Z (e.g. 2d6 or 1d20+5)");
        }
        
        const numDice = parseInt(match[1], 10);
        const diceFaces = parseInt(match[2], 10);
        const modifierSign = match[3] || '+';
        const modifier = match[4] ? parseInt(match[4], 10) : 0;
        
        if (numDice <= 0 || diceFaces <= 1 || numDice > 100) {
            throw new Error("Keep dice numbers within reasonable limits (1-100 dice).");
        }

        let rolls = [];
        let sum = 0;
        for (let i = 0; i < numDice; i++) {
            const roll = Math.floor(Math.random() * diceFaces) + 1;
            rolls.push(roll);
            sum += roll;
        }
        
        const finalMod = modifierSign === '-' ? -modifier : modifier;
        const finalTotal = sum + finalMod;
        
        let message = `🎲 Rolled **${notation}**\nResult: [${rolls.join(', ')}]`;
        if (modifier > 0) message += ` ${modifierSign} ${modifier}`;
        message += ` = **${finalTotal}**`;

        return { notation, rolls, modifierSign, modifier, finalTotal, message };
    }
}