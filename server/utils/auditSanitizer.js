const REDACTED = "[REDACTED]";
const CIRCULAR = "[Circular]";
const TRUNCATED = "[Truncated]";
const MAX_DEPTH = 8;

const SENSITIVE_KEY_PATTERN =
    /(password|passwd|pwd|token|authorization|auth|secret|jwt|cookie|api[-_]?key|credential|connection[-_]?string|mongo(?:db)?[-_]?url|uri)/i;

const SENSITIVE_VALUE_PATTERNS = [
    /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    /https?:\/\/[^/\s:@]+:[^/\s@]+@[^\s"']+/gi,
    /(?:password|passwd|pwd|token|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
];

const isSensitiveAuditKey = (key) =>
    typeof key === "string" && SENSITIVE_KEY_PATTERN.test(key);

const sanitizeString = (value) => {
    let output = value;

    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
        output = output.replace(pattern, REDACTED);
    }

    return output;
};

const sanitizeAuditMetadata = (value, seen = new WeakSet(), depth = 0) => {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === "string") {
        return sanitizeString(value);
    }

    if (typeof value !== "object") {
        return value;
    }

    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    if (typeof value.toHexString === "function") {
        return value;
    }

    if (value instanceof Error) {
        return {
            name: value.name ? sanitizeString(value.name) : "Error",
            message: value.message
                ? sanitizeString(value.message)
                : "Unknown error",
        };
    }

    if (depth >= MAX_DEPTH) {
        return TRUNCATED;
    }

    if (seen.has(value)) {
        return CIRCULAR;
    }

    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((item) =>
            sanitizeAuditMetadata(item, seen, depth + 1),
        );
    }

    const output = {};

    for (const [key, item] of Object.entries(value)) {
        output[key] = isSensitiveAuditKey(key)
            ? REDACTED
            : sanitizeAuditMetadata(item, seen, depth + 1);
    }

    return output;
};

module.exports = {
    CIRCULAR,
    REDACTED,
    TRUNCATED,
    isSensitiveAuditKey,
    sanitizeAuditMetadata,
    sanitizeString,
};
