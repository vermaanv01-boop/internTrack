const mongoose = require("mongoose");

const interviewQuestionSchema = new mongoose.Schema(
    {
        questionId: {
            type: String,
            required: [true, "Question ID is required"],
            trim: true,
        },
        text: {
            type: String,
            required: [true, "Question text is required"],
            trim: true,
        },
        category: {
            type: String,
            required: [true, "Question category is required"],
            trim: true,
        },
        difficulty: {
            type: String,
            required: [true, "Question difficulty is required"],
            enum: {
                values: ["beginner", "intermediate", "advanced"],
                message: "Question difficulty must be beginner, intermediate, or advanced",
            },
        },
        whyRelevant: {
            type: String,
            trim: true,
            default: null,
        },
        keyConcepts: {
            type: [String],
            default: [],
        },
        evaluationCriteria: {
            type: [String],
            default: [],
        },
    },
    {
        _id: false,
    },
);

const interviewAnswerSchema = new mongoose.Schema(
    {
        questionId: {
            type: String,
            required: [true, "Answer question ID is required"],
            trim: true,
        },
        answerText: {
            type: String,
            required: [true, "Answer text is required"],
            trim: true,
            maxlength: [5000, "Answer must not exceed 5,000 characters"],
        },
        submittedAt: {
            type: Date,
            default: Date.now,
        },
        score: {
            type: Number,
            required: [true, "Answer score is required"],
            min: [0, "Answer score must be between 0 and 100"],
            max: [100, "Answer score must be between 0 and 100"],
        },
        strengths: {
            type: [String],
            default: [],
        },
        weaknesses: {
            type: [String],
            default: [],
        },
        missingConcepts: {
            type: [String],
            default: [],
        },
        improvementSuggestions: {
            type: [String],
            default: [],
        },
        evaluationProvider: {
            type: String,
            required: [true, "Evaluation provider is required"],
            trim: true,
        },
        evaluationProviderType: {
            type: String,
            trim: true,
            default: null,
        },
        evaluationFallbackUsed: {
            type: Boolean,
            default: false,
        },
        evaluationFallbackReason: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        _id: false,
    },
);

const interviewPrepSessionSchema = new mongoose.Schema(
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
        resumeSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
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
        difficulty: {
            type: String,
            required: true,
            enum: {
                values: ["beginner", "intermediate", "advanced", "mixed"],
                message: "Difficulty must be beginner, intermediate, advanced, or mixed",
            },
            default: "mixed",
        },
        questions: {
            type: [interviewQuestionSchema],
            default: [],
        },
        categoriesCovered: {
            type: [String],
            default: [],
        },
        questionCount: {
            type: Number,
            min: 0,
            default: 0,
        },
        status: {
            type: String,
            enum: {
                values: ["not_started", "in_progress", "completed"],
                message: "Status must be not_started, in_progress, or completed",
            },
            default: "not_started",
            index: true,
        },
        startedAt: {
            type: Date,
            default: null,
        },
        completedAt: {
            type: Date,
            default: null,
        },
        currentQuestionIndex: {
            type: Number,
            min: 0,
            default: 0,
            validate: {
                validator: Number.isInteger,
                message: "Current question index must be an integer",
            },
        },
        answers: {
            type: [interviewAnswerSchema],
            default: [],
        },
        overallScore: {
            type: Number,
            min: [0, "Overall score must be between 0 and 100"],
            max: [100, "Overall score must be between 0 and 100"],
            default: null,
        },
        provider: {
            type: String,
            trim: true,
            default: null,
        },
        providerType: {
            type: String,
            trim: true,
            default: null,
        },
        fallbackUsed: {
            type: Boolean,
            default: false,
        },
        fallbackReason: {
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

interviewPrepSessionSchema.index({ user: 1, createdAt: -1 });

interviewPrepSessionSchema.set("toJSON", {
    virtuals: true,
    transform: (document, returnedObject) => {
        delete returnedObject.__v;
        return returnedObject;
    },
});

module.exports = mongoose.model("InterviewPrepSession", interviewPrepSessionSchema);
