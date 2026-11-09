const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const TOKEN_KEY = "interntrack_token";
const USER_KEY = "interntrack_user";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setAuthSession = (token, user) => {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    }
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
};

export const clearAuthSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
};

export const getStoredUser = () => {
    try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export class ApiError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
        this.errors = data?.errors || null;
    }
}

export const request = async (endpoint, options = {}) => {
    const {
        method = "GET",
        body,
        headers = {},
        params,
        isFormData = false,
        responseType = "json",
    } = options;

    let url = `${API_BASE_URL}${endpoint}`;

    if (params) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                queryParams.append(key, value);
            }
        });
        const queryString = queryParams.toString();
        if (queryString) {
            url += `${url.includes("?") ? "&" : "?"}${queryString}`;
        }
    }

    const requestHeaders = new Headers(headers);
    const token = getToken();

    if (token && !requestHeaders.has("Authorization")) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    if (!isFormData && !requestHeaders.has("Content-Type") && method !== "GET") {
        requestHeaders.set("Content-Type", "application/json");
    }

    let requestBody = body;
    if (body && !isFormData && typeof body === "object" && !(body instanceof FormData)) {
        requestBody = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: requestBody,
        });
    } catch (networkError) {
        throw new ApiError(
            "Unable to connect to server. Please check your network or server status.",
            0,
            { originalError: networkError.message }
        );
    }

    if (response.status === 401) {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }

    if (responseType === "blob") {
        if (!response.ok) {
            let errorJson = null;
            try {
                errorJson = await response.json();
            } catch {
                // Ignore if not json
            }
            throw new ApiError(
                errorJson?.message || `Request failed with status ${response.status}`,
                response.status,
                errorJson
            );
        }
        const blob = await response.blob();
        const contentDisposition = response.headers.get("Content-Disposition");
        return { blob, contentDisposition };
    }

    let data = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        try {
            data = await response.json();
        } catch {
            data = null;
        }
    } else {
        const text = await response.text();
        data = { message: text };
    }

    if (!response.ok) {
        const errorMessage =
            data?.message ||
            (data?.errors ? Object.values(data.errors).join(", ") : null) ||
            `HTTP ${response.status} error occurred`;
        throw new ApiError(errorMessage, response.status, data);
    }

    return data;
};
