const { CATEGORY_WEIGHTS, SKILLS, getSkillAliases } = require("./skillTaxonomy");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeText = (value) => String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'");

const buildAliasPattern = (alias) => {
    const pieces = String(alias)
        .trim()
        .split(/\s+/)
        .map(escapeRegExp)
        .join("\\s+");

    return new RegExp(`(?<![a-z0-9])${pieces}(?![a-z0-9])`, "g");
};

const SKILL_INDEX = SKILLS.map((skill) => ({
    name: skill.name,
    category: skill.category,
    categoryWeight: CATEGORY_WEIGHTS[skill.category] || 1,
    aliases: getSkillAliases(skill),
    patterns: getSkillAliases(skill).map(buildAliasPattern),
}));

const SKILL_ALIAS_TOKENS = new Set();

for (const skill of SKILL_INDEX) {
    for (const alias of skill.aliases) {
        const normalizedAlias = alias.toLowerCase();

        if (!/\s/.test(normalizedAlias)) {
            SKILL_ALIAS_TOKENS.add(normalizedAlias);
        }

        for (const token of normalizedAlias.split(/[^a-z0-9+#]+/)) {
            if (token) {
                SKILL_ALIAS_TOKENS.add(token);
            }
        }
    }
}

const extractSkills = (text) => {
    const normalized = normalizeText(text);
    const found = new Map();

    for (const skill of SKILL_INDEX) {
        let occurrences = 0;
        let firstIndex = Number.POSITIVE_INFINITY;
        const matchedAliases = new Set();

        for (let patternIndex = 0; patternIndex < skill.patterns.length; patternIndex += 1) {
            const pattern = skill.patterns[patternIndex];

            pattern.lastIndex = 0;

            let match = pattern.exec(normalized);

            while (match) {
                occurrences += 1;
                firstIndex = Math.min(firstIndex, match.index);
                matchedAliases.add(skill.aliases[patternIndex]);
                match = pattern.exec(normalized);
            }
        }

        if (occurrences > 0) {
            found.set(skill.name, {
                name: skill.name,
                category: skill.category,
                categoryWeight: skill.categoryWeight,
                occurrences,
                firstIndex,
                matchedAliases: [...matchedAliases],
            });
        }
    }

    return [...found.values()].sort((left, right) => left.firstIndex - right.firstIndex);
};

const getSkill = (name) => SKILL_INDEX.find((skill) => skill.name === name) || null;

module.exports = {
    SKILL_ALIAS_TOKENS,
    extractSkills,
    getSkill,
    normalizeText,
};
