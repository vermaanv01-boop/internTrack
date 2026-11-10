const REDACTED = "[REDACTED]";

const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const SENSITIVE_KEY_PATTERN =
    /(password|passwd|pwd|token|authorization|auth|secret|jwt|cookie|api[-_]?key|connection[-_]?string|mongo[-_]?url|mongodb|uri|email)/i;

const SENSITIVE_VALUE_PATTERNS = [
    /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    /(?:password|passwd|pwd|token|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
];

const configuredLevel = String(process.env.LOG_LEVEL || "").toLowerCase();
const minimumLevel = Object.prototype.hasOwnProperty.call(LEVELS, configuredLevel)
    ? LEVELS[configuredLevel]
    : process.env.NODE_ENV === "production"
      ? LEVELS.info
      : LEVELS.info;

const sanitize = (value) => {
    let output = String(value);

    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
        output = output.replace(pattern, REDACTED);
    }

    return output;
};

const serializeError = (error) => {
    if (!error || typeof error !== "object") {
        return { message: sanitize(error) };
    }

    const serialized = {
        name: error.name ? sanitize(error.name) : "Error",
        message: error.message ? sanitize(error.message) : "Unknown error",
    };

    if (error.code !== undefined) {
        serialized.code = sanitize(error.code);
    }

    if (typeof error.stack === "string") {
        serialized.stack = sanitize(error.stack);
    }

    return serialized;
};

const redact = (value, seen = new WeakSet(), depth = 0) => {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === "string") {
        return sanitize(value);
    }

    if (typeof value !== "object") {
        return value;
    }

    if (value instanceof Error) {
        return serializeError(value);
    }

    if (depth >= 4) {
        return "[Truncated]";
    }

    if (seen.has(value)) {
        return "[Circular]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((item) => redact(item, seen, depth + 1));
    }

    const output = {};

    for (const [key, item] of Object.entries(value)) {
        output[key] = SENSITIVE_KEY_PATTERN.test(key)
            ? REDACTED
            : redact(item, seen, depth + 1);
    }

    return output;
};

const write = (level, message, meta) => {
    if (LEVELS[level] > minimumLevel) {
        return;
    }

    let entry;

    try {
        entry = JSON.stringify({
            level,
            time: new Date().toISOString(),
            message: sanitize(message),
            ...(meta === undefined ? {} : { meta: redact(meta) }),
        });
    } catch (error) {
        entry = JSON.stringify({
            level,
            time: new Date().toISOString(),
            message: sanitize(message),
            meta: { loggingError: "Unable to serialize log metadata" },
        });
    }

    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(`${entry}\n`);
};

const logger = {
    error: (message, meta) => write("error", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    info: (message, meta) => write("info", message, meta),
    debug: (message, meta) => write("debug", message, meta),
    sanitize,
    serializeError,
    redact,
};

module.exports = logger;
