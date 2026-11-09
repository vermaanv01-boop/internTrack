const mongoose = require("mongoose");

const matchingAnalysisSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            index: true,
        },
        resume: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Resume",
            required: [true, "Resume is required"],
        },
        jobDescription: {
            type: String,
            required: [true, "Job description is required"],
            trim: true,
            maxlength: [30000, "Job description must not exceed 30,000 characters"],
        },
        jobTitle: {
            type: String,
            trim: true,
            default: null,
        },
        company: {
            type: String,
            trim: true,
            default: null,
        },
        matchScore: {
            type: Number,
            required: [true, "Match score is required"],
            min: [0, "Match score must be between 0 and 100"],
            max: [100, "Match score must be between 0 and 100"],
        },
        scoreLabel: {
            type: String,
            required: [true, "Score label is required"],
            trim: true,
        },
        matchedSkills: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        missingSkills: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        partialMatches: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        experienceAlignment: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        educationAlignment: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        matchedKeywords: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        missingKeywords: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        totalKeywords: {
            type: Number,
            min: 0,
            default: 0,
        },
        keywordCoverage: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },
        strengths: {
            type: [String],
            default: [],
        },
        improvements: {
            type: [String],
            default: [],
        },
        scoreBreakdown: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        summary: {
            type: String,
            trim: true,
            default: null,
        },
        provider: {
            type: String,
            trim: true,
            default: null,
        },
        disclaimer: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

matchingAnalysisSchema.index({ user: 1, createdAt: -1 });
matchingAnalysisSchema.index({ user: 1, matchScore: 1 });

matchingAnalysisSchema.set("toJSON", {
    virtuals: true,
    transform: (document, returnedObject) => {
        delete returnedObject.__v;
        return returnedObject;
    },
});

module.exports = mongoose.model("MatchingAnalysis", matchingAnalysisSchema);
