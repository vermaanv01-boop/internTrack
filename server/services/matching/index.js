const localMatchingProvider = require("./localMatchingProvider");

const providers = {
    local: localMatchingProvider,
};

const getMatchingProvider = (name = "local") => providers[name] || providers.local;

const analyzeResumeJob = (resumeText, jobDescription, options = {}) => {
    const provider = getMatchingProvider(options.provider || "local");

    return provider.analyze(resumeText, jobDescription);
};

module.exports = {
    analyzeResumeJob,
    getMatchingProvider,
    providers,
};
