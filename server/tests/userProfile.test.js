const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "test-jwt-secret-for-user-profile-tests";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.SENSITIVE_RATE_LIMIT_MAX = "1000";

const User = require("../models/userModel");
const userRoutes = require("../routes/userRoutes");
const { errorHandler } = require("../middleware/errorHandler");
const { installAuthUserMock } = require("./helpers/authUserMock");

installAuthUserMock(User);

const app = express();
app.use(express.json());
app.use("/api/users", userRoutes);
app.use(errorHandler);

const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);

const originalMethods = {
    findByIdAndUpdate: User.findByIdAndUpdate,
    findOne: User.findOne,
    create: User.create,
};

let updateCalls = [];
let findCalls = [];
let createCalls = [];

beforeEach(() => {
    updateCalls = [];
    findCalls = [];
    createCalls = [];

    User.findByIdAndUpdate = async (id, update, options) => {
        updateCalls.push({ id, update, options });
        return {
            _id: id,
            name: "Updated User",
            email: "updated@example.com",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            ...update,
        };
    };

    User.findOne = async (filter) => {
        findCalls.push(filter);
        return null;
    };

    User.create = async (data) => {
        createCalls.push(data);
        return {
            _id: new mongoose.Types.ObjectId(),
            ...data,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
        };
    };
});

after(() => {
    User.findByIdAndUpdate = originalMethods.findByIdAndUpdate;
    User.findOne = originalMethods.findOne;
    User.create = originalMethods.create;
});

const updateAsUser = (requestBuilder, authToken = token) => (
    requestBuilder.set("Authorization", `Bearer ${authToken}`)
);

test("profile updates require a valid bearer token", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const unauthenticated = await request(app)
        .put(`/api/users/update/${id}`)
        .send({ name: "Updated User" });
    const malformedHeaders = [
        "Basic abc123",
        "Bearer",
        "Bearer first second",
        "Bearer not-a-jwt",
    ];

    assert.equal(unauthenticated.status, 401);

    for (const header of malformedHeaders) {
        const response = await request(app)
            .put(`/api/users/update/${id}`)
            .set("Authorization", header)
            .send({ name: "Updated User" });

        assert.equal(response.status, 401, header);
    }

    assert.equal(updateCalls.length, 0);
});

test("profile updates are restricted to the token owner", async () => {
    const response = await updateAsUser(
        request(app)
            .put(`/api/users/update/${otherUserId}`)
            .send({ name: "Hijacked", role: "admin" }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
        message: "Not authorized to update this account",
    });
    assert.equal(updateCalls.length, 0);
});

test("profile updates validate name, email, password, and empty bodies", async () => {
    const cases = [
        [{}, "body", "Provide at least one field to update"],
        [{ name: "   " }, "name", "Name is required"],
        [{ email: "not-an-email" }, "email", "Email must be a valid email address"],
        [{ password: "short" }, "password", "Password must be at least 8 characters"],
    ];

    for (const [body, field, message] of cases) {
        const response = await updateAsUser(
            request(app).put(`/api/users/update/${userId}`).send(body),
        );

        assert.equal(response.status, 400);
        assert.equal(response.body.message, "Validation failed");
        assert.equal(response.body.errors[field], message);
    }

    assert.equal(updateCalls.length, 0);
});

test("profile updates trim values and ignore role, ownership, and other unknown fields", async () => {
    const response = await updateAsUser(
        request(app)
            .put(`/api/users/update/${userId}`)
            .send({
                name: "  Alice Smith  ",
                email: "  ALICE@EXAMPLE.COM  ",
                role: "admin",
                isEmailVerified: true,
                company: "Acme",
                user: otherUserId,
            }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.message, "User updated successfully");
    assert.equal(response.body.user.name, "Alice Smith");
    assert.equal(response.body.user.email, "alice@example.com");
    assert.equal(response.body.user.role, undefined);
    assert.equal(response.body.user.password, undefined);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].id, userId);
    assert.deepEqual(updateCalls[0].update, {
        name: "Alice Smith",
        email: "alice@example.com",
    });
    assert.deepEqual(updateCalls[0].options, { new: true });
});

test("profile password changes are hashed before persistence", async () => {
    const response = await updateAsUser(
        request(app)
            .put(`/api/users/update/${userId}`)
            .send({ password: "newpassword123" }),
    );

    assert.equal(response.status, 200);
    assert.equal(updateCalls.length, 1);
    assert.notEqual(updateCalls[0].update.password, "newpassword123");
    assert.equal(await bcrypt.compare("newpassword123", updateCalls[0].update.password), true);
    assert.equal(response.body.user.password, undefined);
});

test("profile updates map duplicate email errors to the existing contract", async () => {
    User.findByIdAndUpdate = async () => {
        const error = new Error("E11000 duplicate key error");
        error.code = 11000;
        error.keyPattern = { email: 1 };
        error.keyValue = { email: "taken@example.com" };
        throw error;
    };

    const response = await updateAsUser(
        request(app)
            .put(`/api/users/update/${userId}`)
            .send({ email: "taken@example.com" }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
        message: "User already exists",
        errors: { email: "An account with this email already exists" },
    });
});

test("profile updates preserve the existing missing-user response", async () => {
    User.findByIdAndUpdate = async () => null;

    const response = await updateAsUser(
        request(app)
            .put(`/api/users/update/${userId}`)
            .send({ name: "Missing User" }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { message: "User updated successfully" });
});

test("logout remains stateless and does not require authentication", async () => {
    const response = await request(app).post("/api/users/logout");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { message: "User logged out successfully" });
});

test("registration ignores role and ownership injection and still returns no token", async () => {
    const response = await request(app).post("/api/users/register").send({
        name: "Alice Developer",
        email: "ALICE@EXAMPLE.COM",
        password: "password123",
        role: "admin",
        isEmailVerified: true,
        company: "Acme",
        user: otherUserId,
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.message, "User registered successfully");
    assert.equal(response.body.token, undefined);
    assert.equal(response.body.user.email, "alice@example.com");
    assert.equal(response.body.user.role, undefined);
    assert.equal(response.body.user.password, undefined);
    assert.equal(createCalls.length, 1);
    assert.deepEqual(Object.keys(createCalls[0]).sort(), ["email", "name", "password"]);
    assert.notEqual(createCalls[0].password, "password123");
    assert.equal(findCalls[0].email, "alice@example.com");
});

test("login tokens contain only the user id and responses exclude privilege fields", async () => {
    User.findOne = async () => ({
        _id: userId,
        name: "Alice Developer",
        email: "alice@example.com",
        password: await bcrypt.hash("password123", 4),
        role: "admin",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await request(app)
        .post("/api/users/login")
        .send({ email: "alice@example.com", password: "password123" });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, undefined);
    assert.equal(response.body.user.password, undefined);
    assert.equal(typeof response.body.token, "string");

    const payload = jwt.verify(response.body.token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
    });

    assert.equal(payload.id, userId);
    assert.equal(payload.role, undefined);
});
