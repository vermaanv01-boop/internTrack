const User = require("../models/userModel");
const { validateRegistration } = require("../utils/authValidation");
const { hashPassword: defaultHashPassword } = require("../utils/password");
const logger = require("../utils/logger");

const ADMIN_ROLE = "admin";
const ACTIVE_STATUS = "active";

class AdminProvisioningError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = "AdminProvisioningError";
        this.code = code;

        if (details !== undefined) {
            this.details = details;
        }
    }
}

const isDuplicateKeyError = (error) => Boolean(error && error.code === 11000);

const toSafeAdmin = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    status: user.status,
    createdAt: user.createdAt || user.timestamp,
});

const buildAdminFields = async ({ name, password }, hashPassword) => ({
    name,
    password: await hashPassword(password),
    role: ADMIN_ROLE,
    emailVerified: true,
    status: ACTIVE_STATUS,
});

const saveUpdatedAdmin = async (existingAdmin, fields, UserModel) => {
    if (typeof existingAdmin.save === "function") {
        Object.assign(existingAdmin, fields);
        return existingAdmin.save();
    }

    return UserModel.findOneAndUpdate(
        { _id: existingAdmin._id },
        { $set: fields },
        { new: true, runValidators: true },
    );
};

const provisionAdmin = async (input = {}, options = {}) => {
    const {
        UserModel = User,
        hashPassword = defaultHashPassword,
        validate = validateRegistration,
        log = logger,
    } = options;
    const payload = input && typeof input === "object" && !Array.isArray(input)
        ? input
        : {};
    const { errors, data } = validate({
        name: payload.name,
        email: payload.email,
        password: payload.password,
    });

    if (errors) {
        throw new AdminProvisioningError(
            "VALIDATION_ERROR",
            "Invalid admin account details",
            errors,
        );
    }

    const updateExisting = payload.updateExisting === true;
    const confirmExisting = payload.confirmExisting === true;
    let existingAdmin;

    try {
        existingAdmin = await UserModel.findOne({ email: data.email });
    } catch (error) {
        log.error("Unable to look up admin account", { error });
        throw new AdminProvisioningError(
            "PROVISIONING_FAILED",
            "Unable to provision admin account",
        );
    }

    if (existingAdmin && existingAdmin.role !== ADMIN_ROLE) {
        throw new AdminProvisioningError(
            "EMAIL_IN_USE",
            "An account with this email already exists and cannot be converted to an admin",
        );
    }

    if (existingAdmin && !updateExisting) {
        throw new AdminProvisioningError(
            "ADMIN_EXISTS",
            "An admin account with this email already exists",
        );
    }

    if (existingAdmin && !confirmExisting) {
        throw new AdminProvisioningError(
            "CONFIRMATION_REQUIRED",
            "Updating an existing admin requires explicit confirmation",
        );
    }

    try {
        if (existingAdmin) {
            const fields = await buildAdminFields(data, hashPassword);
            const updatedAdmin = await saveUpdatedAdmin(
                existingAdmin,
                fields,
                UserModel,
            );

            if (!updatedAdmin) {
                throw new AdminProvisioningError(
                    "ADMIN_NOT_FOUND",
                    "Admin account could not be updated",
                );
            }

            return {
                created: false,
                user: toSafeAdmin(updatedAdmin),
            };
        }

        const fields = await buildAdminFields(data, hashPassword);
        const admin = await UserModel.create({
            ...fields,
            email: data.email,
        });

        return {
            created: true,
            user: toSafeAdmin(admin),
        };
    } catch (error) {
        if (error instanceof AdminProvisioningError) {
            throw error;
        }

        if (isDuplicateKeyError(error)) {
            throw new AdminProvisioningError(
                "ADMIN_EXISTS",
                "An admin account with this email already exists",
            );
        }

        log.error("Unable to provision admin account", { error });
        throw new AdminProvisioningError(
            "PROVISIONING_FAILED",
            "Unable to provision admin account",
        );
    }
};

module.exports = {
    ACTIVE_STATUS,
    ADMIN_ROLE,
    AdminProvisioningError,
    provisionAdmin,
    toSafeAdmin,
};
