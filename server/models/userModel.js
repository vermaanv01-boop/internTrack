const mongoose = require("mongoose");

const USER_ROLES = Object.freeze(["jobseeker", "hr", "admin"]);
const USER_STATUSES = Object.freeze(["active", "suspended"]);

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
});

module.exports = mongoose.model("User", userSchema);
