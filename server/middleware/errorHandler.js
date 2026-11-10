const logger = require("../utils/logger");

const formatMongooseValidationError = (error) => {
    const errors = {};

    for (const [field, detail] of Object.entries(error.errors || {})) {
        errors[field] = detail.message;
    }

    return errors;
};

const notFoundHandler = (req, res) => {
    res.status(404).json({ message: "Route not found" });
};

const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Invalid JSON payload" });
    }

    if (error && error.type === "entity.too.large") {
        return res.status(413).json({ message: "Request payload too large" });
    }

    if (error && error.name === "ValidationError") {
        return res.status(400).json({
            message: "Validation failed",
            errors: formatMongooseValidationError(error),
        });
    }

    if (error && error.name === "CastError") {
        return res.status(400).json({ message: "Invalid identifier" });
    }

    if (error && error.code === 11000) {
        return res.status(409).json({ message: "Resource already exists" });
    }

    const statusCode = Number(error && (error.status || error.statusCode));

    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
        logger.warn("Request failed", {
            error,
            method: req.method,
            path: req.path,
        });

        return res.status(statusCode).json({
            message: error.message ? logger.sanitize(error.message) : "Request failed",
        });
    }

    logger.error("Unhandled server error", {
        error,
        method: req.method,
        path: req.path,
    });

    return res.status(500).json({ message: "Server error" });
};

module.exports = { errorHandler, notFoundHandler };
