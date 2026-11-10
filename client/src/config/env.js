const DEFAULT_API_BASE_PATH = "/api";

const normalizeApiBaseUrl = (value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";

    if (!trimmed) {
        return "";
    }

    return trimmed.replace(/\/+$/, "");
};

const isSupportedApiBaseUrl = (value) =>
    value.startsWith("/") || /^https?:\/\//i.test(value);

const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

if (configuredApiBaseUrl && !isSupportedApiBaseUrl(configuredApiBaseUrl)) {
    throw new Error(
        "VITE_API_BASE_URL must be an absolute http(s) URL or a root-relative path.",
    );
}

export const API_BASE_URL = configuredApiBaseUrl || DEFAULT_API_BASE_PATH;

export const IS_PRODUCTION = Boolean(import.meta.env.PROD);

export { normalizeApiBaseUrl };
