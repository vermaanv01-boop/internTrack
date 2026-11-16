const express = require("express");
const {
    registerHr,
    verifyHrEmail,
    resendHrVerification,
} = require("../controllers/hrAuthController");
const {
    authLimiter,
    emailVerificationLimiter,
    resendVerificationLimiter,
} = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/register", authLimiter, registerHr);
router.post("/verify-email", emailVerificationLimiter, verifyHrEmail);
router.post("/resend-verification", resendVerificationLimiter, resendHrVerification);

module.exports = router;
