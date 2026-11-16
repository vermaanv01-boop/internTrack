const rateLimit = require("express-rate-limit");

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 20,
    message = "Too many requests. Please try again later.",
    skipSuccessfulRequests = false,
} = {}) =>
    rateLimit({
        windowMs,
        limit: max,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        skipSuccessfulRequests,
        message,
        handler: (req, res, next, options) => {
            const body =
                typeof options.message === "string"
                    ? { message: options.message }
                    : options.message;

            return res.status(options.statusCode).json(body);
        },
    });

const authLimiter = createRateLimiter({
    windowMs: parsePositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parsePositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 20),
    message: "Too many authentication attempts. Please try again later.",
});

const sensitiveActionLimiter = createRateLimiter({
    windowMs: parsePositiveInteger(
        process.env.SENSITIVE_RATE_LIMIT_WINDOW_MS,
        15 * 60 * 1000,
    ),
    max: parsePositiveInteger(process.env.SENSITIVE_RATE_LIMIT_MAX, 60),
    message: "Too many requests. Please try again later.",
});

const emailVerificationLimiter = createRateLimiter({
    windowMs: parsePositiveInteger(
        process.env.EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS,
        15 * 60 * 1000,
    ),
    max: parsePositiveInteger(process.env.EMAIL_VERIFICATION_RATE_LIMIT_MAX, 20),
    message: "Too many verification attempts. Please try again later.",
});

const resendVerificationLimiter = createRateLimiter({
    windowMs: parsePositiveInteger(
        process.env.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_WINDOW_MS,
        15 * 60 * 1000,
    ),
    max: parsePositiveInteger(
        process.env.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX,
        5,
    ),
    message: "Too many verification email requests. Please try again later.",
});

module.exports = {
    authLimiter,
    sensitiveActionLimiter,
    emailVerificationLimiter,
    resendVerificationLimiter,
    createRateLimiter,
};
