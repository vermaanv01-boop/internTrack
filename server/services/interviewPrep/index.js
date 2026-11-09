const localInterviewPrepProvider = require("./localInterviewPrepProvider");
const localAnswerEvaluationProvider = require("./localEvaluationProvider");

const DEFAULT_PROVIDER = "local";
const FALLBACK_REASON = "The requested interview preparation provider was unavailable; deterministic local generation was used instead.";
const DEFAULT_EVALUATION_PROVIDER = "local";
const EVALUATION_FALLBACK_REASON = "The requested answer evaluation provider was unavailable; deterministic local concept matching was used instead.";

const providers = {
    local: localInterviewPrepProvider,
};

const evaluationProviders = {
    local: localAnswerEvaluationProvider,
};

const registerProvider = (name, provider) => {
    if (!name || !provider || typeof provider.generate !== "function") {
        throw new TypeError("A provider name and generate function are required.");
    }

    providers[name] = provider;
    return provider;
};

const getInterviewPrepProvider = (name = DEFAULT_PROVIDER) => providers[name] || null;

const registerEvaluationProvider = (name, provider) => {
    if (!name || !provider || typeof provider.evaluate !== "function") {
        throw new TypeError("An evaluation provider name and evaluate function are required.");
    }

    evaluationProviders[name] = provider;
    return provider;
};

const getAnswerEvaluationProvider = (name = DEFAULT_EVALUATION_PROVIDER) => (
    evaluationProviders[name] || null
);

const buildResult = (result, options) => ({
    questions: result.questions,
    categoriesCovered: result.categoriesCovered || [...new Set(result.questions.map((question) => question.category))],
    requestedDifficulty: options.requestedDifficulty,
    questionCount: result.questions.length,
    provider: options.provider,
    providerType: options.providerType,
    fallbackUsed: options.fallbackUsed,
    fallbackReason: options.fallbackUsed ? FALLBACK_REASON : null,
});

const validateProviderResult = (result) => {
    if (!result || !Array.isArray(result.questions) || result.questions.length === 0) {
        throw new Error("Interview preparation provider returned no questions.");
    }
};

const generateInterviewQuestions = (input, options = {}) => {
    const requested = options.provider || DEFAULT_PROVIDER;
    const isProviderObject = requested && typeof requested === "object";
    const requestedName = isProviderObject
        ? requested.name || "custom"
        : String(requested);
    const provider = isProviderObject ? requested : getInterviewPrepProvider(requestedName);
    const requestedDifficulty = input.difficulty || "mixed";

    if (!provider) {
        const localResult = localInterviewPrepProvider.generate(input);

        validateProviderResult(localResult);

        return buildResult(localResult, {
            requestedDifficulty,
            provider: localInterviewPrepProvider.name,
            providerType: localInterviewPrepProvider.type,
            fallbackUsed: true,
        });
    }

    try {
        const result = provider.generate(input);

        validateProviderResult(result);

        return buildResult(result, {
            requestedDifficulty,
            provider: requestedName,
            providerType: provider.type || "custom",
            fallbackUsed: false,
        });
    } catch (error) {
        if (provider === localInterviewPrepProvider) {
            throw error;
        }

        const localResult = localInterviewPrepProvider.generate(input);

        validateProviderResult(localResult);

        return buildResult(localResult, {
            requestedDifficulty,
            provider: localInterviewPrepProvider.name,
            providerType: localInterviewPrepProvider.type,
            fallbackUsed: true,
        });
    }
};

const normalizeStringArray = (value) => (
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
);

const buildEvaluationResult = (result, options) => {
    const score = Number(result.score);

    if (!Number.isFinite(score)) {
        throw new Error("Answer evaluation provider returned an invalid score.");
    }

    return {
        score: Math.min(100, Math.max(0, Math.round(score))),
        strengths: normalizeStringArray(result.strengths),
        weaknesses: normalizeStringArray(result.weaknesses),
        missingConcepts: normalizeStringArray(result.missingConcepts),
        improvementSuggestions: normalizeStringArray(result.improvementSuggestions),
        evaluationProvider: options.provider,
        evaluationProviderType: options.providerType,
        evaluationFallbackUsed: options.fallbackUsed,
        evaluationFallbackReason: options.fallbackUsed ? EVALUATION_FALLBACK_REASON : null,
        evaluationMethod: typeof result.methodology === "string" && result.methodology.trim()
            ? result.methodology.trim()
            : "Provider-reported answer evaluation.",
    };
};

const validateEvaluationResult = (result) => {
    if (!result || typeof result !== "object" || !Number.isFinite(Number(result.score))) {
        throw new Error("Answer evaluation provider returned an invalid result.");
    }
};

const evaluateInterviewAnswer = (input, options = {}) => {
    const requested = options.provider || DEFAULT_EVALUATION_PROVIDER;
    const isProviderObject = requested && typeof requested === "object";
    const requestedName = isProviderObject
        ? requested.name || "custom"
        : String(requested);
    const provider = isProviderObject ? requested : getAnswerEvaluationProvider(requestedName);

    if (!provider) {
        const localResult = localAnswerEvaluationProvider.evaluate(input);

        validateEvaluationResult(localResult);

        return buildEvaluationResult(localResult, {
            provider: localAnswerEvaluationProvider.name,
            providerType: localAnswerEvaluationProvider.type,
            fallbackUsed: true,
        });
    }

    try {
        const result = provider.evaluate(input);

        validateEvaluationResult(result);

        return buildEvaluationResult(result, {
            provider: requestedName,
            providerType: provider.type || "custom",
            fallbackUsed: false,
        });
    } catch (error) {
        if (provider === localAnswerEvaluationProvider) {
            throw error;
        }

        const localResult = localAnswerEvaluationProvider.evaluate(input);

        validateEvaluationResult(localResult);

        return buildEvaluationResult(localResult, {
            provider: localAnswerEvaluationProvider.name,
            providerType: localAnswerEvaluationProvider.type,
            fallbackUsed: true,
        });
    }
};

module.exports = {
    DEFAULT_EVALUATION_PROVIDER,
    DEFAULT_PROVIDER,
    EVALUATION_FALLBACK_REASON,
    FALLBACK_REASON,
    evaluateInterviewAnswer,
    evaluationProviders,
    generateInterviewQuestions,
    getAnswerEvaluationProvider,
    getInterviewPrepProvider,
    providers,
    registerEvaluationProvider,
    registerProvider,
};
