const { SKILL_ALIAS_TOKENS, normalizeText } = require("./skillMatcher");

const KEYWORD_STOP_WORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "also", "am", "an",
    "and", "any", "are", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "could", "did", "do", "does",
    "doing", "down", "during", "each", "either", "else", "etc", "even", "ever",
    "every", "few", "for", "from", "further", "get", "gets", "getting", "give",
    "go", "going", "good", "had", "has", "have", "having", "he", "her", "here",
    "hers", "herself", "him", "himself", "his", "how", "however", "i", "if", "in",
    "into", "is", "it", "its", "itself", "job", "just", "like", "make", "many",
    "may", "me", "might", "more", "most", "must", "my", "myself", "need", "needs",
    "neither", "no", "nor", "not", "now", "of", "off", "on", "once", "one", "only",
    "or", "other", "our", "ours", "ourselves", "out", "over", "own", "per", "plus",
    "preferred", "preferably", "required", "requirement", "requirements", "role",
    "same", "she", "should", "so", "some", "such", "than", "that", "the", "their",
    "theirs", "them", "themselves", "then", "there", "these", "they", "this",
    "those", "through", "to", "too", "under", "until", "up", "us", "use", "used",
    "using", "very", "via", "was", "we", "well", "were", "what", "when", "where",
    "whether", "which", "while", "who", "whom", "why", "will", "with", "within",
    "without", "would", "you", "your", "yours", "yourself", "yourselves",
    "ability", "able", "across", "additional", "advantage", "affirmative", "all",
    "applicant", "applicants", "application", "apply", "background", "benefit",
    "benefits", "candidate", "candidates", "company", "contributions", "degree",
    "bachelor", "doctorate", "master", "undergraduate", "entry", "junior",
    "senior", "level", "demonstrated", "description", "desired", "detail",
    "details", "duties", "employment", "environment", "equal", "equivalent",
    "excellent", "expect", "expected", "experience", "experienced",
    "familiarity", "familiar", "field", "following", "full", "highly",
    "including", "individual", "industry", "knowledge", "looking", "minimum",
    "opportunity", "opportunities", "position", "preferred", "qualification",
    "qualifications", "related", "relevant", "responsible", "responsibilities",
    "solid", "strong", "skills", "skill", "team", "teams", "technical", "time",
    "understanding", "work", "working", "years", "year", "yrs", "plus", "nice",
    "must", "join", "help", "ensure", "provide", "support", "based", "within",
    "well", "new", "day", "daily", "part", "fulltime", "full-time", "remote",
    "hybrid", "onsite",
]);

const EXPERIENCE_SIGNAL_PATTERNS = [
    "internship", "intern", "professional experience", "work experience",
    "employment history", "freelance", "open source", "open-source", "capstone",
    "volunteer", "teaching assistant", "research assistant",
];

const DEGREE_LEVELS = [
    {
        key: "doctorate",
        label: "Doctorate",
        rank: 5,
        pattern: /(?<![a-z0-9])(?:ph\.?\s?d\.?|doctorate|doctoral)(?![a-z0-9])/gi,
    },
    {
        key: "master",
        label: "Master's",
        rank: 4,
        pattern: /(?<![a-z0-9])(?:master'?s?|mba|m\.?\s?s\.?|m\.?\s?tech(?:nology)?|m\.?\s?eng(?:ineering)?)(?![a-z0-9])/gi,
    },
    {
        key: "bachelor",
        label: "Bachelor's",
        rank: 3,
        pattern: /(?<![a-z0-9])(?:bachelor'?s?|b\.?\s?s\.?|b\.?\s?tech(?:nology)?|b\.?\s?eng(?:ineering)?|undergraduate)(?![a-z0-9])/gi,
    },
    {
        key: "associate",
        label: "Associate",
        rank: 2,
        pattern: /(?<![a-z0-9])(?:associate'?s?|a\.?\s?a\.?)(?![a-z0-9])/gi,
    },
    {
        key: "high_school",
        label: "High School",
        rank: 1,
        pattern: /(?<![a-z0-9])(?:high school|secondary school|ged)(?![a-z0-9])/gi,
    },
];

const FIELD_PATTERNS = [
    "computer science", "software engineering", "computer engineering",
    "information technology", "information systems", "data science",
    "electrical engineering", "mechanical engineering", "mathematics",
    "statistics", "business administration", "human resources", "marketing",
    "finance", "accounting", "graphic design", "psychology", "communications",
];

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPhrasePattern = (value) => new RegExp(
    `(?<![a-z0-9])${String(value).trim().split(/\s+/).map(escapeRegExp).join("\\s+")}(?![a-z0-9])`,
    "gi",
);

const snippetAround = (text, index, length) => {
    const raw = String(text || "");
    const start = Math.max(0, index - 100);
    const end = Math.min(raw.length, index + length + 140);

    return raw
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();
};

const findEvidence = (text, regex) => {
    const normalized = normalizeText(text);
    const pattern = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
    const match = pattern.exec(normalized);

    if (!match) {
        return null;
    }

    return snippetAround(text, match.index, match[0].length);
};

const extractYears = (text, mode) => {
    let working = normalizeText(text);
    const candidates = [];

    const consume = (pattern, valueForMatch) => {
        working = working.replace(pattern, (match, ...args) => {
            const value = valueForMatch(match, args);

            if (Number.isFinite(value)) {
                candidates.push(value);
            }

            return " ".repeat(match.length);
        });
    };

    consume(
        /(\d{1,2}(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d+)?)\+?\s*(?:years?|yrs?)/gi,
        (match, args) => {
            const lower = Number(args[0]);
            const upper = Number(args[1]);

            if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
                return null;
            }

            return mode === "requirement" ? Math.min(lower, upper) : Math.max(lower, upper);
        },
    );

    consume(
        /(?:at\s+least|minimum(?:\s+of)?|min\.?)\s*(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi,
        (match, args) => Number(args[0]),
    );

    consume(
        /(\d{1,2}(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/gi,
        (match, args) => Number(args[0]),
    );

    consume(
        /(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)/gi,
        (match, args) => Number(args[0]),
    );

    if (candidates.length === 0) {
        return 0;
    }

    return Math.max(...candidates);
};

const extractExperience = (text, options = {}) => {
    const mode = options.mode === "requirement" ? "requirement" : "candidate";
    const years = extractYears(text, mode);
    const yearEvidence = years > 0
        ? findEvidence(text, /(\d{1,2}(?:\.\d+)?)\s*(?:\+?\s*)?(?:-|–|—|to)?\s*(?:\d{1,2}(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)/i)
        : null;

    const signals = [];

    for (const signal of EXPERIENCE_SIGNAL_PATTERNS) {
        if (buildPhrasePattern(signal).test(text)) {
            signals.push(signal);
        }
    }

    return {
        years,
        evidence: yearEvidence || (signals.length > 0 ? findEvidence(text, buildPhrasePattern(signals[0])) : null),
        signals,
        hasExperienceSignal: years > 0 || signals.length > 0,
    };
};

const isPreferredContext = (text, index) => {
    const start = Math.max(0, index - 90);
    const end = Math.min(text.length, index + 90);
    const context = text.slice(start, end);

    return /\b(?:preferred|preferably|a plus|advantageous|desired)\b/i.test(context);
};

const extractEducation = (text, options = {}) => {
    const normalized = normalizeText(text);
    const mode = options.mode === "requirement" ? "requirement" : "candidate";
    const matches = [];

    for (const level of DEGREE_LEVELS) {
        level.pattern.lastIndex = 0;

        let match = level.pattern.exec(normalized);

        while (match) {
            matches.push({
                key: level.key,
                label: level.label,
                rank: level.rank,
                index: match.index,
                length: match[0].length,
                preferred: isPreferredContext(normalized, match.index),
            });
            match = level.pattern.exec(normalized);
        }
    }

    const fields = FIELD_PATTERNS.filter((field) => buildPhrasePattern(field).test(normalized));
    const usableMatches = mode === "requirement" && matches.some((match) => !match.preferred)
        ? matches.filter((match) => !match.preferred)
        : matches;
    const highest = usableMatches.reduce((best, match) => (
        !best || match.rank > best.rank ? match : best
    ), null);

    return {
        level: highest ? highest.key : "none",
        label: highest ? highest.label : "Not specified",
        rank: highest ? highest.rank : 0,
        evidence: highest ? snippetAround(text, highest.index, highest.length) : null,
        fields,
    };
};

const isMeaningfulToken = (token) => (
    token.length >= 3
    && !KEYWORD_STOP_WORDS.has(token)
    && !SKILL_ALIAS_TOKENS.has(token)
    && !/^\d+$/.test(token)
);

const extractKeywordCandidates = (jobText) => {
    const normalized = normalizeText(jobText);
    const tokenPattern = /[a-z][a-z0-9+#]*(?:\.[a-z0-9+#]+)*/g;
    const tokens = [...normalized.matchAll(tokenPattern)].map((match) => ({
        token: match[0],
        start: match.index,
        end: match.index + match[0].length,
    }));
    const meaningful = tokens.filter((entry) => isMeaningfulToken(entry.token));
    const counts = new Map();

    const add = (term, multiplier) => {
        const key = term.replace(/\s+/g, " ").trim();
        const current = counts.get(key) || { term: key, count: 0, weight: 0, tokenCount: key.split(" ").length };
        current.count += 1;
        current.weight += multiplier;
        counts.set(key, current);
    };

    for (const entry of meaningful) {
        add(entry.token, 1);
    }

    for (let index = 0; index < meaningful.length - 1; index += 1) {
        const left = meaningful[index];
        const right = meaningful[index + 1];
        const gap = normalized.slice(left.end, right.start);

        if (!/^[ \t]+$/.test(gap)) {
            continue;
        }

        add(`${left.token} ${right.token}`, 1.35);
    }

    const sorted = [...counts.values()].sort((left, right) => (
        right.weight - left.weight
        || right.count - left.count
        || left.term.localeCompare(right.term)
    ));
    const selected = [];

    for (const candidate of sorted) {
        const candidateTokens = new Set(candidate.term.split(" "));

        const overlapsSelected = selected.some((item) => {
            const itemTokens = new Set(item.term.split(" "));
            const candidateIsSubset = [...candidateTokens].every((token) => itemTokens.has(token));
            const itemIsSubset = [...itemTokens].every((token) => candidateTokens.has(token));

            return candidateIsSubset || itemIsSubset;
        });

        if (!overlapsSelected) {
            selected.push(candidate);
        }

        if (selected.length >= 18) {
            break;
        }
    }

    return selected;
};

const countTerm = (text, term) => {
    if (!text || !term) {
        return 0;
    }

    const pattern = buildPhrasePattern(term);
    const matches = normalizeText(text).match(pattern);

    return matches ? matches.length : 0;
};

const extractKeywords = (jobText, resumeText) => {
    const candidates = extractKeywordCandidates(jobText);
    const matchedKeywords = [];
    const missingKeywords = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const candidate of candidates) {
        const resumeMentions = countTerm(resumeText, candidate.term);
        const entry = {
            keyword: candidate.term,
            jobMentions: candidate.count,
            resumeMentions,
        };

        totalWeight += candidate.weight;

        if (resumeMentions > 0) {
            matchedWeight += candidate.weight;
            matchedKeywords.push(entry);
        } else {
            missingKeywords.push(entry);
        }
    }

    return {
        matchedKeywords,
        missingKeywords,
        totalKeywords: candidates.length,
        score: totalWeight === 0 ? 100 : Math.round((matchedWeight / totalWeight) * 100),
    };
};

module.exports = {
    extractEducation,
    extractExperience,
    extractKeywords,
    findEvidence,
};
