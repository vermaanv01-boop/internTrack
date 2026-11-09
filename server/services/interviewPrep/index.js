const localInterviewPrepProvider = require("./localInterviewPrepProvider");

const DEFAULT_PROVIDER = "local";
const FALLBACK_REASON = "The requested interview preparation provider was unavailable; deterministic local generation was used instead.";

const providers = {
    local: localInterviewPrepProvider,
};

const registerProvider = (name, provider) => {
    if (!name || !provider || typeof provider.generate !== "function") {
        throw new TypeError("A provider name and generate function are required.");
    }

    providers[name] = provider;
    return provider;
};

const getInterviewPrepProvider = (name = DEFAULT_PROVIDER) => providers[name] || null;

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

module.exports = {
    DEFAULT_PROVIDER,
    FALLBACK_REASON,
    generateInterviewQuestions,
    getInterviewPrepProvider,
    providers,
    registerProvider,
};
