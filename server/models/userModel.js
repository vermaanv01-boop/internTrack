const mongoose = require("mongoose");

const USER_ROLES = Object.freeze(["jobseeker", "hr", "admin"]);
const USER_STATUSES = Object.freeze(["active", "suspended"]);

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

const userSchema = new mongoose.Schema({
    name: { type: String, required: [true, "Please provide name"], trim: true },
    email: {
        type: String,
        required: [true, "Please provide email"],
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: { type: String, required: [true, "Please provide password"] },
    timestamp: { type: Date, default: Date.now },
    role: {
        type: String,
        required: [true, "Role is required"],
        enum: {
            values: USER_ROLES,
            message: `Role must be one of: ${USER_ROLES.join(", ")}`,
        },
        default: "jobseeker",
    },
    emailVerified: { type: Boolean, required: true, default: true },
    status: {
        type: String,
        required: [true, "Status is required"],
        enum: {
            values: USER_STATUSES,
            message: `Status must be one of: ${USER_STATUSES.join(", ")}`,
        },
        default: "active",
    },
    pendingCompanyName: {
        type: String,
        trim: true,
        maxlength: [150, "Company name must not exceed 150 characters"],
    },
    pendingCompanyWebsite: {
        type: String,
        trim: true,
        maxlength: [2048, "Website must not exceed 2048 characters"],
        validate: {
            validator: isValidWebsite,
            message: "Website must be a valid http or https URL",
        },
    },
});

const User = mongoose.model("User", userSchema);

User.USER_ROLES = USER_ROLES;
User.USER_STATUSES = USER_STATUSES;

module.exports = User;
