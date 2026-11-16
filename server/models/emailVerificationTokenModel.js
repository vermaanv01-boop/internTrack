const mongoose = require("mongoose");

const emailVerificationTokenSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User is required"],
        index: true,
    },
    tokenHash: {
        type: String,
        required: [true, "Token hash is required"],
        unique: true,
        trim: true,
    },
    expiresAt: {
        type: Date,
        required: [true, "Expiration timestamp is required"],
    },
    consumedAt: {
        type: Date,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailVerificationTokenSchema.index({ user: 1, consumedAt: 1 });

emailVerificationTokenSchema.methods.isExpired = function isExpired(now = new Date()) {
    if (!this.expiresAt) {
        return true;
    }

    return new Date(this.expiresAt).getTime() <= new Date(now).getTime();
};

emailVerificationTokenSchema.methods.isConsumed = function isConsumed() {
    return Boolean(this.consumedAt);
};

emailVerificationTokenSchema.methods.isUsable = function isUsable(now = new Date()) {
    return !this.isConsumed() && !this.isExpired(now);
};

emailVerificationTokenSchema.methods.consume = function consume(now = new Date()) {
    if (!this.isUsable(now)) {
        return false;
    }

    this.consumedAt = now;
    return true;
};

emailVerificationTokenSchema.statics.findUsableByHash = function findUsableByHash(
    tokenHash,
    now = new Date(),
) {
    return this.findOne({
        tokenHash,
        consumedAt: null,
        expiresAt: { $gt: now },
    });
};

emailVerificationTokenSchema.statics.consumeByHash = function consumeByHash(
    tokenHash,
    now = new Date(),
) {
    return this.findOneAndUpdate(
        {
            tokenHash,
            consumedAt: null,
            expiresAt: { $gt: now },
        },
        { $set: { consumedAt: now } },
        { new: true },
    );
};

module.exports = mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);
