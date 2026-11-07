const mongoose = require("mongoose");

const EMPLOYMENT_TYPES = [
    "full-time",
    "part-time",
    "internship",
    "contract",
    "other",
];

const APPLICATION_STATUSES = [
    "saved",
    "applied",
    "screening",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
];

const applicationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            index: true,
        },
        company: {
            type: String,
            required: [true, "Company is required"],
            trim: true,
        },
        role: {
            type: String,
            required: [true, "Role is required"],
            trim: true,
        },
        jobUrl: {
            type: String,
            trim: true,
        },
        location: {
            type: String,
            trim: true,
        },
        employmentType: {
            type: String,
            enum: {
                values: EMPLOYMENT_TYPES,
                message: `Employment type must be one of: ${EMPLOYMENT_TYPES.join(", ")}`,
            },
        },
        status: {
            type: String,
            enum: {
                values: APPLICATION_STATUSES,
                message: `Status must be one of: ${APPLICATION_STATUSES.join(", ")}`,
            },
            default: "saved",
            required: [true, "Status is required"],
        },
        appliedAt: {
            type: Date,
        },
        deadline: {
            type: Date,
        },
        salary: {
            type: String,
            trim: true,
        },
        notes: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    },
);

applicationSchema.index({ user: 1, status: 1 });
applicationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Application", applicationSchema);
