const logger = require("../utils/logger");

const requestLogger = (req, res, next) => {
    if (process.env.NODE_ENV === "test" || process.env.LOG_HTTP_REQUESTS === "false") {
        return next();
    }

    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

        logger.info("HTTP request completed", {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
        });
    });

    return next();
};

module.exports = { requestLogger };
