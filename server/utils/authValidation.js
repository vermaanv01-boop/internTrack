const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const ensureBodyObject = (body) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { body: "Request body must be a JSON object" };
    }

    return null;
};

const parseName = (value, errors, required) => {
    if (value === undefined || value === null || value === "") {
        if (required) {
            errors.name = "Name is required";
        }

        return undefined;
    }

    if (typeof value !== "string") {
        errors.name = "Name must be a string";
        return undefined;
    }

    const trimmed = value.trim();

    if (!trimmed && required) {
        errors.name = "Name is required";
        return undefined;
    }

    if (trimmed.length > MAX_NAME_LENGTH) {
        errors.name = `Name must not exceed ${MAX_NAME_LENGTH} characters`;
        return undefined;
    }

    return trimmed;
};

const parseEmail = (value, errors, required) => {
    if (value === undefined || value === null || value === "") {
        if (required) {
            errors.email = "Email is required";
        }

        return undefined;
    }

    if (typeof value !== "string") {
        errors.email = "Email must be a string";
        return undefined;
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed && required) {
        errors.email = "Email is required";
        return undefined;
    }

    if (trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmed)) {
        errors.email = "Email must be a valid email address";
        return undefined;
    }

    return trimmed;
};

const parsePassword = (value, errors, required) => {
    if (value === undefined || value === null || value === "") {
        if (required) {
            errors.password = "Password is required";
        }

        return undefined;
    }

    if (typeof value !== "string") {
        errors.password = "Password must be a string";
        return undefined;
    }

    if (value.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
        return undefined;
    }

    if (value.length > MAX_PASSWORD_LENGTH) {
        errors.password = `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`;
        return undefined;
    }

    return value;
};

const validateRegistration = (body) => {
    const bodyError = ensureBodyObject(body);

    if (bodyError) {
        return { errors: bodyError };
    }

    const errors = {};
    const data = {
        name: parseName(body.name, errors, true),
        email: parseEmail(body.email, errors, true),
        password: parsePassword(body.password, errors, true),
    };

    return Object.keys(errors).length > 0 ? { errors } : { data };
};

const validateLogin = (body) => {
    const bodyError = ensureBodyObject(body);

    if (bodyError) {
        return { errors: bodyError };
    }

    const errors = {};
    const data = {
        email: parseEmail(body.email, errors, true),
        password: parsePassword(body.password, errors, true),
    };

    return Object.keys(errors).length > 0 ? { errors } : { data };
};

const validateUserUpdate = (body) => {
    const bodyError = ensureBodyObject(body);

    if (bodyError) {
        return { errors: bodyError };
    }

    const errors = {};
    const data = {};

    if (hasOwn(body, "name")) {
        const name = parseName(body.name, errors, true);

        if (name !== undefined) {
            data.name = name;
        }
    }

    if (hasOwn(body, "email")) {
        const email = parseEmail(body.email, errors, true);

        if (email !== undefined) {
            data.email = email;
        }
    }

    if (hasOwn(body, "password")) {
        const password = parsePassword(body.password, errors, false);

        if (password !== undefined) {
            data.password = password;
        }
    }

    if (Object.keys(errors).length > 0) {
        return { errors };
    }

    if (Object.keys(data).length === 0) {
        return { errors: { body: "Provide at least one field to update" } };
    }

    return { data };
};

module.exports = {
    validateRegistration,
    validateLogin,
    validateUserUpdate,
};
