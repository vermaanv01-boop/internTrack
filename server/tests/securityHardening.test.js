const { after, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-security-hardening";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.AUTH_RATE_LIMIT_MAX = "100";
process.env.SENSITIVE_RATE_LIMIT_MAX = "100";

const { app: fullApp } = require("../server");
const { protect } = require("../middleware/authMiddleware");
const { errorHandler } = require("../middleware/errorHandler");
const { createRateLimiter } = require("../middleware/rateLimiters");
const logger = require("../utils/logger");
const User = require("../models/userModel");
const userRoutes = require("../routes/userRoutes");

const originalUserMethods = {
    findOne: User.findOne,
    create: User.create,
};

after(() => {
    User.findOne = originalUserMethods.findOne;
    User.create = originalUserMethods.create;
});

const buildAuthApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/users", userRoutes);
    app.use(errorHandler);
    return app;
};

test("applies Helmet security headers and hides the Express fingerprint", async () => {
    const res = await request(fullApp).get("/");

    assert.equal(res.status, 200);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
    assert.ok(res.headers["content-security-policy"]);
    assert.equal(res.headers["x-powered-by"], undefined);
});

test("health endpoint reports application and database status without secrets", async () => {
    const res = await request(fullApp).get("/api/health");

    assert.ok([200, 503].includes(res.status));
    assert.ok(["ok", "degraded"].includes(res.body.status));
    assert.equal(typeof res.body.timestamp, "string");
    assert.equal(typeof res.body.uptime, "number");
    assert.equal(typeof res.body.database.connected, "boolean");
    assert.ok(
        ["connected", "connecting", "disconnected", "disconnecting", "unknown"].includes(
            res.body.database.status,
        ),
    );

    const serialized = JSON.stringify(res.body);
    assert.ok(!/mongodb(?:\+srv)?:\/\//i.test(serialized));
    assert.ok(!serialized.includes(process.env.JWT_SECRET));
    assert.ok(!serialized.includes("MONGO_URL"));
});

test("returns a consistent error for malformed JSON and never includes a stack trace", async () => {
    const res = await request(fullApp)
        .post("/api/users/register")
        .set("Content-Type", "application/json")
        .send('{"name":');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: "Invalid JSON payload" });
    assert.equal(res.body.stack, undefined);
});

test("rejects oversized JSON payloads", async () => {
    const app = express();
    app.use(express.json({ limit: "128b" }));
    app.post("/data", (req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app)
        .post("/data")
        .send({ value: "x".repeat(500) });

    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { message: "Request payload too large" });
});

test("handles invalid ObjectIds through the centralized error handler", async () => {
    const app = express();
    app.get("/cast", (req, res, next) => {
        next(new mongoose.Error.CastError("ObjectId", "not-an-id", "_id"));
    });
    app.use(errorHandler);

    const res = await request(app).get("/cast");

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: "Invalid identifier" });
});

test("hides unexpected error details and stack traces from API responses", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
        const app = express();
        app.get("/boom", (req, res, next) => {
            next(
                new Error(
                    "failed mongodb://user:secret@localhost/db for alice@example.com token=abc123",
                ),
            );
        });
        app.use(errorHandler);

        const res = await request(app).get("/boom");

        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { message: "Server error" });

        const serialized = JSON.stringify(res.body);
        assert.ok(!serialized.includes("mongodb://"));
        assert.ok(!serialized.includes("alice@example.com"));
        assert.ok(!serialized.includes("token=abc123"));
        assert.ok(!serialized.includes("at "));
    } finally {
        process.env.NODE_ENV = previousNodeEnv;
    }
});

test("returns JSON 404 responses for unknown API routes", async () => {
    const res = await request(fullApp).get("/api/does-not-exist");

    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { message: "Route not found" });
});

test("rate limiter blocks repeated requests with a consistent error response", async () => {
    const app = express();
    app.use(
        createRateLimiter({
            windowMs: 60 * 1000,
            max: 2,
            message: "Too many authentication attempts. Please try again later.",
        }),
    );
    app.get("/limited", (req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    assert.equal((await request(app).get("/limited")).status, 200);
    assert.equal((await request(app).get("/limited")).status, 200);

    const blocked = await request(app).get("/limited");

    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, {
        message: "Too many authentication attempts. Please try again later.",
    });
});

test("validates registration input before any database operation", async () => {
    const app = buildAuthApp();
    const res = await request(app).post("/api/users/register").send({
        name: "A",
        email: "not-an-email",
        password: "short",
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Validation failed");
    assert.ok(res.body.errors.email);
    assert.ok(res.body.errors.password);
    assert.equal(res.body.token, undefined);

    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes("short"));
});

test("registration responses never expose password hashes or raw passwords", async () => {
    User.findOne = async () => null;
    User.create = async (data) => ({
        _id: new mongoose.Types.ObjectId(),
        ...data,
        createdAt: new Date(),
    });

    try {
        const app = buildAuthApp();
        const res = await request(app).post("/api/users/register").send({
            name: "Alice Developer",
            email: "alice@example.com",
            password: "password123",
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.user.email, "alice@example.com");
        assert.equal(res.body.user.password, undefined);
        assert.equal(res.body.token, undefined);

        const serialized = JSON.stringify(res.body);
        assert.ok(!serialized.includes("password123"));
        assert.ok(!serialized.includes("$2a$"));
        assert.ok(!serialized.includes("$2b$"));
    } finally {
        User.findOne = originalUserMethods.findOne;
        User.create = originalUserMethods.create;
    }
});

test("login validation rejects incomplete credentials without exposing secrets", async () => {
    const app = buildAuthApp();
    const res = await request(app)
        .post("/api/users/login")
        .send({ email: "alice@example.com" });

    assert.equal(res.status, 400);
    assert.ok(res.body.errors.password);
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.stack, undefined);
});

test("login rejects malformed passwords but preserves credential error behavior", async () => {
    User.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: "Alice Developer",
        email: "alice@example.com",
        password: await bcrypt.hash("password123", 4),
        createdAt: new Date(),
    });

    try {
        const app = buildAuthApp();
        const res = await request(app)
            .post("/api/users/login")
            .send({ email: "alice@example.com", password: "wrongpassword" });

        assert.equal(res.status, 400);
        assert.equal(res.body.message, "Invalid credentials");
        assert.equal(res.body.token, undefined);
    } finally {
        User.findOne = originalUserMethods.findOne;
    }
});

test("login verifies legacy passwords shorter than the registration minimum", async () => {
    User.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: "Legacy User",
        email: "legacy@example.com",
        password: await bcrypt.hash("short", 4),
        createdAt: new Date(),
    });

    try {
        const app = buildAuthApp();
        const res = await request(app)
            .post("/api/users/login")
            .send({ email: "legacy@example.com", password: "short" });

        assert.equal(res.status, 200);
        assert.ok(res.body.token);
        assert.equal(res.body.user.email, "legacy@example.com");
    } finally {
        User.findOne = originalUserMethods.findOne;
    }
});

test("registration still enforces the minimum password length", async () => {
    const app = buildAuthApp();
    const res = await request(app).post("/api/users/register").send({
        name: "Short Password",
        email: "short@example.com",
        password: "short",
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Validation failed");
    assert.equal(res.body.errors.password, "Password must be at least 8 characters");
});

test("JWT middleware accepts HS256 tokens and rejects invalid algorithms or signatures", async () => {
    const app = express();
    app.get("/protected", protect, (req, res) => res.json({ id: req.user.id }));
    app.use(errorHandler);

    const id = new mongoose.Types.ObjectId().toString();
    const validToken = jwt.sign({ id }, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "1h",
    });
    const unsupportedToken = jwt.sign({ id }, process.env.JWT_SECRET, {
        algorithm: "HS512",
        expiresIn: "1h",
    });

    const valid = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${validToken}`);

    assert.equal(valid.status, 200);
    assert.equal(valid.body.id, id);

    const unsupported = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${unsupportedToken}`);

    assert.equal(unsupported.status, 401);

    const tampered = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${validToken.slice(0, -2)}xx`);

    assert.equal(tampered.status, 401);
});

test("structured logger redacts credentials, tokens, connection strings and personal data", () => {
    const redacted = logger.redact({
        password: "hunter2",
        token: "abc123",
        email: "alice@example.com",
        headers: {
            authorization: "Bearer super-secret-token",
        },
        database: "mongodb://user:pass@localhost:27017/interntrack",
        message:
            "login failed password=hunter2 for alice@example.com token=abc123 at mongodb://user:pass@localhost/db",
    });

    const serialized = JSON.stringify(redacted);

    assert.ok(!serialized.includes("hunter2"));
    assert.ok(!serialized.includes("alice@example.com"));
    assert.ok(!serialized.includes("abc123"));
    assert.ok(!serialized.includes("super-secret-token"));
    assert.ok(!serialized.includes("mongodb://"));
    assert.ok(serialized.includes("[REDACTED]"));

    const error = logger.serializeError(
        new Error("failed for alice@example.com using mongodb://user:pass@localhost/db"),
    );
    const serializedError = JSON.stringify(error);

    assert.ok(!serializedError.includes("alice@example.com"));
    assert.ok(!serializedError.includes("mongodb://"));
});
