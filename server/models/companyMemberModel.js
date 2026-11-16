const mongoose = require("mongoose");

const COMPANY_MEMBER_ROLES = Object.freeze(["owner", "recruiter", "interviewer"]);
const COMPANY_MEMBER_STATUSES = Object.freeze([
    "invited",
    "active",
    "suspended",
    "removed",
]);

const companyMemberSchema = new mongoose.Schema(
    {
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: [true, "Company is required"],
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
        },
        role: {
            type: String,
            required: [true, "Company member role is required"],
            enum: {
                values: COMPANY_MEMBER_ROLES,
                message: `Company member role must be one of: ${COMPANY_MEMBER_ROLES.join(", ")}`,
            },
        },
        status: {
            type: String,
            enum: {
                values: COMPANY_MEMBER_STATUSES,
                message: `Company member status must be one of: ${COMPANY_MEMBER_STATUSES.join(", ")}`,
            },
            default: "invited",
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        joinedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true },
);

companyMemberSchema.index({ company: 1, user: 1 }, { unique: true });
companyMemberSchema.index({ company: 1, status: 1 });
companyMemberSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model("CompanyMember", companyMemberSchema);
