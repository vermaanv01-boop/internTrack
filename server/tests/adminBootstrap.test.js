const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const {
    AdminProvisioningError,
    provisionAdmin,
} = require("../services/adminBootstrap");

const silentLogger = {
    error: () => {},
};

const adminInput = (overrides = {}) => ({
    name: "Platform Admin",
    email: "admin@example.com",
    password: "password123",
    ...overrides,
});

const fakeHash = async (password) => `hashed:${password}`;

test("creates a verified active admin with a hashed password and safe output", async () => {
    let createPayload;
    const UserModel = {
        findOne: async () => null,
        create: async (fields) => {
            createPayload = fields;
            return {
                _id: new mongoose.Types.ObjectId(),
                ...fields,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
            };
        },
    };

    const result = await provisionAdmin(
        adminInput({
            email: "  ADMIN@EXAMPLE.COM  ",
            role: "jobseeker",
            emailVerified: false,
            status: "suspended",
        }),
        { UserModel },
    );

    assert.equal(result.created, true);
    assert.equal(result.user.email, "admin@example.com");
    assert.equal(result.user.name, "Platform Admin");
    assert.equal(result.user.role, "admin");
    assert.equal(result.user.emailVerified, true);
    assert.equal(result.user.status, "active");
    assert.equal(result.user.password, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(result.user, "password"), false);
    assert.equal(createPayload.email, "admin@example.com");
    assert.notEqual(createPayload.password, "password123");
    assert.equal(await bcrypt.compare("password123", createPayload.password), true);
    assert.equal(createPayload.role, "admin");
    assert.equal(createPayload.emailVerified, true);
    assert.equal(createPayload.status, "active");
});

test("rejects invalid admin details before querying the database", async () => {
    let findOneCalls = 0;
    const UserModel = {
        findOne: async () => {
            findOneCalls += 1;
            return null;
        },
    };

    for (const input of [
        adminInput({ email: "not-an-email" }),
        adminInput({ password: "short" }),
        adminInput({ name: "   " }),
    ]) {
        await assert.rejects(
            provisionAdmin(input, { UserModel }),
            (error) => {
                assert.equal(error instanceof AdminProvisioningError, true);
                assert.equal(error.code, "VALIDATION_ERROR");
                assert.ok(error.details);
                return true;
            },
        );
    }

    assert.equal(findOneCalls, 0);
});

test("refuses to convert an existing non-admin account", async () => {
    let createCalls = 0;
    const UserModel = {
        findOne: async () => ({
            _id: new mongoose.Types.ObjectId(),
            email: "admin@example.com",
            role: "jobseeker",
        }),
        create: async () => {
            createCalls += 1;
            return null;
        },
    };

    await assert.rejects(
        provisionAdmin(adminInput(), { UserModel }),
        (error) => {
            assert.equal(error.code, "EMAIL_IN_USE");
            return true;
        },
    );

    assert.equal(createCalls, 0);
});

test("requires explicit update and confirmation for an existing admin", async () => {
    let saveCalls = 0;
    const existingAdmin = {
        _id: new mongoose.Types.ObjectId(),
        name: "Old Admin",
        email: "admin@example.com",
        password: "old-hash",
        role: "admin",
        emailVerified: true,
        status: "active",
        save: async () => {
            saveCalls += 1;
            return existingAdmin;
        },
    };
    const UserModel = {
        findOne: async () => existingAdmin,
    };

    await assert.rejects(
        provisionAdmin(adminInput(), { UserModel }),
        (error) => {
            assert.equal(error.code, "ADMIN_EXISTS");
            return true;
        },
    );

    await assert.rejects(
        provisionAdmin(adminInput({ updateExisting: true }), { UserModel }),
        (error) => {
            assert.equal(error.code, "CONFIRMATION_REQUIRED");
            return true;
        },
    );

    assert.equal(saveCalls, 0);
});

test("updates an existing admin after explicit confirmation without changing email or role", async () => {
    const existingAdmin = {
        _id: new mongoose.Types.ObjectId(),
        name: "Old Admin",
        email: "admin@example.com",
        password: "old-hash",
        role: "admin",
        emailVerified: false,
        status: "suspended",
    };
    let updateCall;
    const UserModel = {
        findOne: async () => existingAdmin,
        findOneAndUpdate: async (filter, update, options) => {
            updateCall = { filter, update, options };

            return {
                ...existingAdmin,
                ...update.$set,
            };
        },
    };

    const result = await provisionAdmin(
        adminInput({
            name: "New Admin",
            password: "new-password",
            updateExisting: true,
            confirmExisting: true,
        }),
        {
            UserModel,
            hashPassword: fakeHash,
            log: silentLogger,
        },
    );

    assert.equal(result.created, false);
    assert.equal(result.user.name, "New Admin");
    assert.equal(result.user.email, "admin@example.com");
    assert.equal(result.user.role, "admin");
    assert.equal(result.user.emailVerified, true);
    assert.equal(result.user.status, "active");
    assert.equal(result.user.password, undefined);
    assert.equal(updateCall.filter._id, existingAdmin._id);
    assert.equal(updateCall.update.$set.password, "hashed:new-password");
    assert.equal(updateCall.update.$set.role, "admin");
    assert.equal(Object.prototype.hasOwnProperty.call(updateCall.update.$set, "email"), false);
    assert.deepEqual(updateCall.options, { new: true, runValidators: true });
});

test("maps duplicate-key races and storage failures to safe provisioning errors", async () => {
    const duplicateUserModel = {
        findOne: async () => null,
        create: async () => {
            const error = new Error("duplicate email");
            error.code = 11000;
            throw error;
        },
    };

    await assert.rejects(
        provisionAdmin(adminInput(), {
            UserModel: duplicateUserModel,
            hashPassword: fakeHash,
            log: silentLogger,
        }),
        (error) => {
            assert.equal(error.code, "ADMIN_EXISTS");
            return true;
        },
    );

    const failingUserModel = {
        findOne: async () => {
            throw new Error("database unavailable");
        },
    };

    await assert.rejects(
        provisionAdmin(adminInput(), {
            UserModel: failingUserModel,
            hashPassword: fakeHash,
            log: silentLogger,
        }),
        (error) => {
            assert.equal(error.code, "PROVISIONING_FAILED");
            assert.equal(error.message.includes("password123"), false);
            return true;
        },
    );
});
