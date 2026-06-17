// BEGIN FILE: js/utils/NameGenerator.js
export class NameGenerator {
    /**
     * Generates a formatted markdown string of random names.
     */
    static generate(theme, countMale, countFemale, dataset) {
        if (!dataset) {
            throw new Error(`Theme "${theme}" not found in dataset.`);
        }

        if (countMale > dataset.male_given.length) {
            throw new Error(`Not enough male names in ${theme} dataset (Max: ${dataset.male_given.length}).`);
        }
        if (countFemale > dataset.female_given.length) {
            throw new Error(`Not enough female names in ${theme} dataset (Max: ${dataset.female_given.length}).`);
        }

        const shuffle = (array) => [...array].sort(() => 0.5 - Math.random());
        
        const males = shuffle(dataset.male_given).slice(0, countMale);
        const females = shuffle(dataset.female_given).slice(0, countFemale);
        const surnames = shuffle(dataset.surnames);
        
        let output = `🏷️ **Generated Names (${theme})**\n\n`;
        
        if (countMale > 0) {
            output += `**Male Names:**\n`;
            males.forEach((m, i) => output += `- ${m} ${surnames[i % surnames.length]}\n`);
            output += `\n`;
        }
        if (countFemale > 0) {
            output += `**Female Names:**\n`;
            females.forEach((f, i) => output += `- ${f} ${surnames[(countMale + i) % surnames.length]}\n`);
        }

        return output.trim();
    }
}