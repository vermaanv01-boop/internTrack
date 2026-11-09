const STOP_WORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "also", "am", "an",
    "and", "any", "are", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "could", "did", "do", "does",
    "doing", "down", "during", "each", "few", "for", "from", "further", "had",
    "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
    "himself", "his", "how", "however", "i", "if", "in", "into", "is", "it",
    "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor",
    "not", "now", "of", "off", "on", "once", "only", "or", "other", "our",
    "ours", "ourselves", "out", "over", "own", "per", "same", "she", "should",
    "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "under", "until", "up", "us", "very", "via", "was", "we",
    "were", "what", "when", "where", "whether", "which", "while", "who", "whom",
    "why", "will", "with", "within", "without", "would", "you", "your", "yours",
    "yourself", "yourselves",
]);

const CRITERIA_STOP_WORDS = new Set([
    ...STOP_WORDS,
    "accurately", "address", "addresses", "answer", "approach", "chooses",
    "compare", "compares", "concept", "concepts", "connect", "connects",
    "core", "criteria", "define", "defines", "demonstrate", "demonstrates",
    "describe", "describes", "explain", "explains", "identify", "identifies",
    "include", "includes", "provide", "provides", "response", "select",
    "selects", "show", "shows", "use", "uses", "using",
]);

const METHODOLOGY = "Deterministic local evaluation using concept and criteria token overlap, answer depth, and evidence signals; this is not semantic AI evaluation.";

const normalizeText = (value) => String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'");

const tokenize = (value) => normalizeText(value).match(/[a-z0-9+#]+/g) || [];

const stemToken = (token) => {
    if (token.length > 5 && token.endsWith("ation")) return token.slice(0, -5);
    if (token.length > 5 && token.endsWith("ction")) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith("tion")) return token.slice(0, -4);
    if (token.length > 5 && token.endsWith("ment")) return token.slice(0, -4);
    if (token.length > 5 && token.endsWith("ness")) return token.slice(0, -4);
    if (token.length > 5 && token.endsWith("ate")) return token.slice(0, -3);
    if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith("ing")) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
    return token;
};

const meaningfulTokens = (value, extraStopWords = STOP_WORDS) => tokenize(value)
    .filter((token) => token.length >= 3 && !extraStopWords.has(token))
    .map(stemToken);

const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];

const formatList = (items, fallback) => {
    const values = uniqueStrings(items).slice(0, 3);

    if (values.length === 0) {
        return fallback;
    }

    if (values.length === 1) {
        return values[0];
    }

    if (values.length === 2) {
        return `${values[0]} and ${values[1]}`;
    }

    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
};

const round = (value) => Math.round(value);

const clampScore = (value) => Math.min(100, Math.max(0, round(value)));

const calculateCoverage = (text, answerTokens, answerText, extraStopWords = STOP_WORDS) => {
    const normalized = normalizeText(text).trim();

    if (!normalized) {
        return { coverage: null, tokens: [] };
    }

    const tokens = uniqueStrings(meaningfulTokens(normalized, extraStopWords));

    if (tokens.length === 0) {
        return { coverage: null, tokens: [] };
    }

    if (normalizeText(answerText).includes(normalized)) {
        return { coverage: 1, tokens };
    }

    const matched = tokens.filter((token) => answerTokens.has(token));

    return {
        coverage: matched.length / tokens.length,
        tokens,
    };
};

const buildConceptDetails = (keyConcepts, answerTokens, answerText) => keyConcepts.map((concept) => {
    const result = calculateCoverage(concept, answerTokens, answerText);

    return {
        concept,
        coverage: result.coverage === null ? 0 : result.coverage,
    };
});

const buildCriteriaDetails = (evaluationCriteria, answerTokens, answerText) => evaluationCriteria
    .map((criterion) => {
        const result = calculateCoverage(criterion, answerTokens, answerText, CRITERIA_STOP_WORDS);

        return {
            criterion,
            coverage: result.coverage,
        };
    })
    .filter((item) => item.coverage !== null);

const calculateDepthScore = (answerText) => {
    const words = tokenize(answerText);
    const wordCount = words.length;
    const markers = [
        /\b(?:because|therefore|as a result|for example|for instance|measured|improved|reduced|increased|resulted|outcome|percent)\b/i,
        /\b\d+(?:\.\d+)?%?\b/,
        /\b(?:tradeoff|trade-off|test|testing|validated|validation|monitored|monitoring|benchmark|metric)\b/i,
    ];
    const markerCount = markers.filter((pattern) => pattern.test(answerText)).length;
    let lengthScore;

    if (wordCount >= 80) {
        lengthScore = 100;
    } else if (wordCount >= 50) {
        lengthScore = 90;
    } else if (wordCount >= 30) {
        lengthScore = 70;
    } else if (wordCount >= 15) {
        lengthScore = 45;
    } else {
        lengthScore = 20;
    }

    return {
        score: Math.min(100, lengthScore + Math.min(3, markerCount) * 10),
        wordCount,
        markerCount,
    };
};

const buildStrengths = ({
    coveredConcepts,
    criteriaDetails,
    depth,
    score,
}) => {
    const strengths = [];

    if (coveredConcepts.length > 0) {
        strengths.push(
            `Addresses expected concept${coveredConcepts.length === 1 ? "" : "s"}: ${formatList(coveredConcepts, "none")}.`,
        );
    }

    if (criteriaDetails.some((item) => item.coverage >= 0.5)) {
        strengths.push("Connects the response to at least one of the question's evaluation criteria.");
    }

    if (depth.wordCount >= 50) {
        strengths.push("Provides a developed response with supporting detail.");
    } else if (depth.wordCount >= 25) {
        strengths.push("Provides enough detail to show a structured answer.");
    }

    if (depth.markerCount >= 2) {
        strengths.push("Includes reasoning, evidence, or outcome language rather than only a definition.");
    }

    if (score >= 85) {
        strengths.push("Covers most of the expected concepts and criteria used by this deterministic evaluation.");
    }

    if (strengths.length === 0) {
        strengths.push("The response was submitted with enough length to be evaluated.");
    }

    return strengths.slice(0, 5);
};

const buildWeaknesses = ({
    missingConcepts,
    criteriaDetails,
    depth,
    conceptCoverage,
}) => {
    const weaknesses = [];
    const criteriaAverage = criteriaDetails.length > 0
        ? criteriaDetails.reduce((total, item) => total + item.coverage, 0) / criteriaDetails.length
        : null;

    if (missingConcepts.length > 0) {
        weaknesses.push(`Does not clearly address: ${formatList(missingConcepts, "none")}.`);
    }

    if (depth.wordCount < 30) {
        weaknesses.push("The response is brief and may not provide enough detail for a complete interview answer.");
    }

    if (depth.markerCount === 0) {
        weaknesses.push("Does not clearly include an example, tradeoff, validation step, or measurable outcome.");
    }

    if (criteriaAverage !== null && criteriaAverage < 0.35) {
        weaknesses.push("Does not clearly connect the response to several of the question's evaluation criteria.");
    }

    if (conceptCoverage < 0.5 && missingConcepts.length === 0) {
        weaknesses.push("The response only partially covers the expected concepts.");
    }

    if (weaknesses.length === 0) {
        weaknesses.push("No major gaps were detected by deterministic matching; human review is still recommended for nuance.");
    }

    return weaknesses.slice(0, 5);
};

const buildImprovementSuggestions = ({
    missingConcepts,
    criteriaDetails,
    depth,
}) => {
    const suggestions = [];
    const criteriaAverage = criteriaDetails.length > 0
        ? criteriaDetails.reduce((total, item) => total + item.coverage, 0) / criteriaDetails.length
        : null;

    for (const concept of missingConcepts.slice(0, 3)) {
        suggestions.push(
            `Add a concrete explanation of ${concept}, including how you would apply it or which tradeoffs matter.`,
        );
    }

    if (depth.wordCount < 45) {
        suggestions.push("Expand the answer with a specific example, the decision you made, and the result.");
    }

    if (depth.markerCount < 2) {
        suggestions.push("Include evidence such as tradeoffs, validation steps, or measurable results where applicable.");
    }

    if (criteriaAverage !== null && criteriaAverage < 0.35) {
        suggestions.push("Make the link between your answer and the question's evaluation criteria more explicit.");
    }

    if (suggestions.length === 0) {
        suggestions.push("Add a brief closing summary of the outcome and what you would do differently next time.");
    }

    return suggestions.slice(0, 5);
};

const evaluate = ({ question, answerText }) => {
    const questionData = question && typeof question === "object" ? question : {};
    const safeAnswerText = typeof answerText === "string" ? answerText.trim() : "";
    const keyConcepts = Array.isArray(questionData.keyConcepts)
        ? uniqueStrings(questionData.keyConcepts.map(String))
        : [];
    const evaluationCriteria = Array.isArray(questionData.evaluationCriteria)
        ? uniqueStrings(questionData.evaluationCriteria.map(String))
        : [];
    const answerTokens = new Set(meaningfulTokens(safeAnswerText));
    const conceptDetails = buildConceptDetails(keyConcepts, answerTokens, safeAnswerText);
    const criteriaDetails = buildCriteriaDetails(evaluationCriteria, answerTokens, safeAnswerText);
    const depth = calculateDepthScore(safeAnswerText);
    const conceptCoverage = conceptDetails.length > 0
        ? conceptDetails.reduce((total, item) => total + item.coverage, 0) / conceptDetails.length
        : null;
    const criteriaCoverage = criteriaDetails.length > 0
        ? criteriaDetails.reduce((total, item) => total + item.coverage, 0) / criteriaDetails.length
        : null;
    let weights;

    if (conceptCoverage !== null && criteriaCoverage !== null) {
        weights = { concepts: 70, criteria: 15, depth: 15 };
    } else if (conceptCoverage !== null) {
        weights = { concepts: 85, criteria: 0, depth: 15 };
    } else if (criteriaCoverage !== null) {
        weights = { concepts: 0, criteria: 85, depth: 15 };
    } else {
        weights = { concepts: 0, criteria: 0, depth: 100 };
    }

    const score = clampScore(
        (conceptCoverage === null ? 0 : conceptCoverage * 100) * (weights.concepts / 100)
        + (criteriaCoverage === null ? 0 : criteriaCoverage * 100) * (weights.criteria / 100)
        + depth.score * (weights.depth / 100),
    );
    const missingConcepts = conceptDetails
        .filter((item) => item.coverage < 0.5)
        .map((item) => item.concept)
        .slice(0, 5);
    const coveredConcepts = conceptDetails
        .filter((item) => item.coverage >= 0.5)
        .map((item) => item.concept);

    return {
        score,
        strengths: buildStrengths({
            coveredConcepts,
            criteriaDetails,
            depth,
            score,
        }),
        weaknesses: buildWeaknesses({
            missingConcepts,
            criteriaDetails,
            depth,
            conceptCoverage: conceptCoverage === null ? 0 : conceptCoverage,
        }),
        missingConcepts,
        improvementSuggestions: buildImprovementSuggestions({
            missingConcepts,
            criteriaDetails,
            depth,
        }),
        methodology: METHODOLOGY,
    };
};

module.exports = {
    METHODOLOGY,
    name: "local",
    type: "local",
    evaluate,
};
