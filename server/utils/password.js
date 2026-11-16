const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 10;

const hashPassword = async (password) => {
    if (typeof password !== "string" || password.length === 0) {
        const error = new TypeError("Password must be a non-empty string");
        error.code = "INVALID_PASSWORD";
        throw error;
    }

    return bcrypt.hash(password, BCRYPT_ROUNDS);
};

const verifyPassword = async (password, passwordHash) => {
    if (
        typeof password !== "string" ||
        typeof passwordHash !== "string" ||
        passwordHash.length === 0
    ) {
        return false;
    }

    return bcrypt.compare(password, passwordHash);
};

module.exports = {
    BCRYPT_ROUNDS,
    hashPassword,
    verifyPassword,
};
