const EmailVerificationToken = require("../models/emailVerificationTokenModel");
const {
  generateVerificationToken,
  getVerificationTokenExpiry,
} = require("../utils/verificationToken");

const issueVerificationToken = async ({
  userId,
  invalidateExisting = false,
  now = new Date(),
  TokenModel = EmailVerificationToken,
}) => {
  if (invalidateExisting) {
    await TokenModel.updateMany(
      { user: userId, consumedAt: null },
      { $set: { consumedAt: now } },
    );
  }

  const generated = generateVerificationToken();
  const expiresAt = getVerificationTokenExpiry(now);

  await TokenModel.create({
    user: userId,
    tokenHash: generated.tokenHash,
    expiresAt,
    createdAt: now,
  });

  return {
    token: generated.token,
    tokenHash: generated.tokenHash,
    expiresAt,
  };
};

module.exports = { issueVerificationToken };
