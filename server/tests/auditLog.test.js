const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const AuditLog = require("../models/auditLogModel");
const {
    CIRCULAR,
    REDACTED,
    TRUNCATED,
    isSensitiveAuditKey,
    sanitizeAuditMetadata,
} = require("../utils/auditSanitizer");

const hasIndex = (schema, fields) =>
    schema.indexes().some(([index]) =>
        JSON.stringify(index) === JSON.stringify(fields),
    );

const assertValidationError = async (document, field) => {
    await assert.rejects(document.validate(), (error) => {
        assert.equal(error.name, "ValidationError");
        assert.ok(error.errors[field], `Expected a validation error for ${field}`);
        return true;
    });
};

test("AuditLog applies defaults, trims fields, and defines query indexes", async () => {
    const actor = new mongoose.Types.ObjectId();
    const log = new AuditLog({
        actor,
        action: "  admin.user.create  ",
        resourceType: "  user  ",
        resourceId: "  user-123  ",
    });

    await log.validate();

    assert.equal(log.action, "admin.user.create");
    assert.equal(log.resourceType, "user");
    assert.equal(log.resourceId, "user-123");
    assert.deepEqual(log.metadata, {});
    assert.equal(log.ipAddress, null);
    assert.ok(log.createdAt instanceof Date);
    assert.equal(AuditLog.schema.path("actor").options.ref, "User");
    assert.equal(AuditLog.schema.path("createdAt").options.immutable, true);
    assert.ok(hasIndex(AuditLog.schema, { actor: 1, createdAt: -1 }));
    assert.ok(hasIndex(AuditLog.schema, { action: 1, createdAt: -1 }));
    assert.ok(hasIndex(AuditLog.schema, {
        resourceType: 1,
        resourceId: 1,
        createdAt: -1,
    }));
});

test("AuditLog requires actor, action, and resource type", async () => {
    const actor = new mongoose.Types.ObjectId();

    await assertValidationError(new AuditLog({}), "actor");
    await assertValidationError(
        new AuditLog({ actor, resourceType: "user" }),
        "action",
    );
    await assertValidationError(
        new AuditLog({ actor, action: "admin.user.create" }),
        "resourceType",
    );
});

test("sanitizes nested sensitive metadata before validation without mutating input", async () => {
    const actor = new mongoose.Types.ObjectId();
    const metadata = {
        password: "super-secret",
        nested: {
            accessToken: "token-value",
            authorization: "Bearer abc.def.ghi",
            email: "person@example.com",
            note: "password=hunter2 and token=abc123",
            jwt: "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.signature",
            database: "mongodb://user:pass@example.com/db",
        },
        items: [
            { apiKey: "key-123", label: "visible" },
            { secret: "hidden", value: "visible" },
        ],
    };
    const log = new AuditLog({
        actor,
        action: "admin.user.update",
        resourceType: "user",
        metadata,
    });

    await log.validate();

    assert.equal(log.metadata.password, REDACTED);
    assert.equal(log.metadata.nested.accessToken, REDACTED);
    assert.equal(log.metadata.nested.authorization, REDACTED);
    assert.equal(log.metadata.nested.email, "person@example.com");
    assert.equal(log.metadata.nested.jwt, REDACTED);
    assert.equal(log.metadata.nested.database, REDACTED);
    assert.equal(log.metadata.nested.note, `${REDACTED} and ${REDACTED}`);
    assert.equal(log.metadata.items[0].apiKey, REDACTED);
    assert.equal(log.metadata.items[0].label, "visible");
    assert.equal(log.metadata.items[1].secret, REDACTED);
    assert.equal(log.metadata.items[1].value, "visible");
    assert.equal(metadata.password, "super-secret");
    assert.equal(metadata.nested.accessToken, "token-value");
});

test("sanitizer preserves dates and ObjectIds and handles circular metadata", () => {
    const date = new Date("2026-02-03T04:05:06.000Z");
    const resourceId = new mongoose.Types.ObjectId();
    const circular = {
        createdAt: date,
        resourceId,
        child: {},
    };

    circular.child.parent = circular;

    const sanitized = sanitizeAuditMetadata(circular);

    assert.equal(sanitized.createdAt instanceof Date, true);
    assert.equal(sanitized.createdAt.getTime(), date.getTime());
    assert.equal(sanitized.resourceId, resourceId);
    assert.equal(sanitized.child.parent, CIRCULAR);
});

test("sanitizer handles deep metadata and identifies sensitive keys", () => {
    let deep = { value: "okay" };

    for (let index = 0; index < 12; index += 1) {
        deep = { nested: deep };
    }

    assert.equal(sanitizeAuditMetadata(deep).nested.nested.nested.nested.nested.nested.nested.nested, TRUNCATED);
    assert.equal(isSensitiveAuditKey("password"), true);
    assert.equal(isSensitiveAuditKey("refresh_token"), true);
    assert.equal(isSensitiveAuditKey("targetEmail"), false);
});
