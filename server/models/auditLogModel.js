const mongoose = require("mongoose");
const {
    sanitizeAuditMetadata,
} = require("../utils/auditSanitizer");

const auditLogSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Actor is required"],
        },
        action: {
            type: String,
            required: [true, "Action is required"],
            trim: true,
            maxlength: [100, "Action must not exceed 100 characters"],
        },
        resourceType: {
            type: String,
            required: [true, "Resource type is required"],
            trim: true,
            maxlength: [100, "Resource type must not exceed 100 characters"],
        },
        resourceId: {
            type: String,
            trim: true,
            maxlength: [200, "Resource ID must not exceed 200 characters"],
            default: null,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        ipAddress: {
            type: String,
            trim: true,
            maxlength: [64, "IP address must not exceed 64 characters"],
            default: null,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

auditLogSchema.pre("validate", function sanitizeMetadata() {
    if (this.metadata !== undefined) {
        this.metadata = sanitizeAuditMetadata(this.metadata);
    }
});

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
