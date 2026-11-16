const crypto = require("crypto");

const DEFAULT_TOKEN_TTL_MINUTES = 60;
const TOKEN_BYTES = 32;

const getTokenTtlMinutes = () => {
  const parsed = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TOKEN_TTL_MINUTES;
};

const hashVerificationToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const generateVerificationToken = () => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashVerificationToken(token),
  };
};

const getVerificationTokenExpiry = (now = new Date()) =>
  new Date(now.getTime() + getTokenTtlMinutes() * 60 * 1000);

module.exports = {
  generateVerificationToken,
  getTokenTtlMinutes,
  getVerificationTokenExpiry,
  hashVerificationToken,
};
