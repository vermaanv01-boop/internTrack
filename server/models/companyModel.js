const mongoose = require("mongoose");

const COMPANY_STATUSES = Object.freeze(["active", "suspended"]);
const COMPANY_VERIFICATION_STATUSES = Object.freeze([
    "self_registered",
    "verified",
    "flagged",
]);
const EMAIL_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i;

const isValidWebsite = (value) => {
    if (value === undefined || value === null || value === "") {
        return true;
    }

    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (error) {
        return false;
    }
};

const companySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Company name is required"],
            trim: true,
            maxlength: [150, "Company name must not exceed 150 characters"],
        },
        slug: {
            type: String,
            required: [true, "Company slug is required"],
            unique: true,
            trim: true,
            lowercase: true,
            match: [
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                "Company slug may contain lowercase letters, numbers, and single hyphens",
            ],
        },
        website: {
            type: String,
            trim: true,
            maxlength: [2048, "Website must not exceed 2048 characters"],
            validate: {
                validator: isValidWebsite,
                message: "Website must be a valid http or https URL",
            },
        },
        emailDomain: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: [253, "Email domain must not exceed 253 characters"],
            match: [EMAIL_DOMAIN_PATTERN, "Email domain must be a valid domain name"],
        },
        status: {
            type: String,
            required: [true, "Company status is required"],
            enum: {
                values: COMPANY_STATUSES,
                message: `Company status must be one of: ${COMPANY_STATUSES.join(", ")}`,
            },
            default: "active",
        },
        verificationStatus: {
            type: String,
            required: [true, "Verification status is required"],
            enum: {
                values: COMPANY_VERIFICATION_STATUSES,
                message: `Verification status must be one of: ${COMPANY_VERIFICATION_STATUSES.join(", ")}`,
            },
            default: "self_registered",
        },
    },
    { timestamps: true },
);

companySchema.index({ verificationStatus: 1, status: 1 });
companySchema.index({ emailDomain: 1 }, { sparse: true });

const Company = mongoose.model("Company", companySchema);

Company.COMPANY_STATUSES = COMPANY_STATUSES;
Company.COMPANY_VERIFICATION_STATUSES = COMPANY_VERIFICATION_STATUSES;

module.exports = Company;
