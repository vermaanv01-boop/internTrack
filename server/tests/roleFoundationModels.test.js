const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../models/userModel");
const Company = require("../models/companyModel");
const CompanyMember = require("../models/companyMemberModel");
const EmailVerificationToken = require("../models/emailVerificationTokenModel");
const Application = require("../models/applicationModel");
const Resume = require("../models/resumeModel");
const MatchingAnalysis = require("../models/matchingAnalysisModel");
const InterviewPrepSession = require("../models/interviewPrepSessionModel");

const assertValidationError = async (document, field) => {
    await assert.rejects(document.validate(), (error) => {
        assert.equal(error.name, "ValidationError");
        assert.ok(error.errors[field], `Expected a validation error for ${field}`);
        return true;
    });
};

const hasIndex = (schema, fields, options = {}) => schema.indexes().some(([index, indexOptions]) => (
    JSON.stringify(index) === JSON.stringify(fields)
    && Object.entries(options).every(([key, value]) => indexOptions[key] === value)
));

test("User preserves existing fields and defaults new platform fields", async () => {
    const user = new User({
        name: "  Alice Developer  ",
        email: "  ALICE@EXAMPLE.COM  ",
        password: "password123",
    });

    await user.validate();

    assert.equal(user.name, "Alice Developer");
    assert.equal(user.email, "alice@example.com");
    assert.equal(user.password, "password123");
    assert.ok(user.timestamp instanceof Date);
    assert.equal(user.role, "jobseeker");
    assert.equal(user.emailVerified, true);
    assert.equal(user.status, "active");
    assert.ok(hasIndex(User.schema, { email: 1 }, { unique: true }));

    const hrUser = new User({
        name: "Hiring Manager",
        email: "hr@example.com",
        password: "password123",
        role: "hr",
        emailVerified: false,
        status: "suspended",
    });

    await hrUser.validate();
    assert.equal(hrUser.role, "hr");
    assert.equal(hrUser.emailVerified, false);
    assert.equal(hrUser.status, "suspended");

    const adminUser = new User({
        name: "Admin",
        email: "admin@example.com",
        password: "password123",
        role: "admin",
    });

    await adminUser.validate();
    assert.equal(adminUser.role, "admin");
});

test("User requires existing fields and rejects invalid role or status values", async () => {
    const missing = new User({});
    const missingValidation = await missing.validate().catch((error) => error);

    assert.equal(missingValidation.name, "ValidationError");
    assert.ok(missingValidation.errors.name);
    assert.ok(missingValidation.errors.email);
    assert.ok(missingValidation.errors.password);

    await assertValidationError(
        new User({
            name: "Alice",
            email: "alice@example.com",
            password: "password123",
            role: "recruiter",
        }),
        "role",
    );

    await assertValidationError(
        new User({
            name: "Alice",
            email: "alice@example.com",
            password: "password123",
            status: "inactive",
        }),
        "status",
    );
});

test("Company validates fields, defaults statuses, and defines lookup indexes", async () => {
    const company = new Company({
        name: "  Acme Labs  ",
        slug: "  Acme-Labs  ",
        website: "  https://acme.example.com  ",
        emailDomain: "  ACME.EXAMPLE.COM  ",
    });

    await company.validate();

    assert.equal(company.name, "Acme Labs");
    assert.equal(company.slug, "acme-labs");
    assert.equal(company.website, "https://acme.example.com");
    assert.equal(company.emailDomain, "acme.example.com");
    assert.equal(company.status, "active");
    assert.equal(company.verificationStatus, "self_registered");
    assert.equal(Company.schema.options.timestamps, true);
    assert.ok(hasIndex(Company.schema, { slug: 1 }, { unique: true }));
    assert.ok(hasIndex(Company.schema, { verificationStatus: 1, status: 1 }));
    assert.ok(hasIndex(Company.schema, { emailDomain: 1 }, { sparse: true }));

    await assertValidationError(new Company({ slug: "acme" }), "name");
    await assertValidationError(new Company({ name: "Acme" }), "slug");
    await assertValidationError(
        new Company({ name: "Acme", slug: "Acme Labs" }),
        "slug",
    );
    await assertValidationError(
        new Company({ name: "Acme", slug: "acme", website: "ftp://acme.com" }),
        "website",
    );
    await assertValidationError(
        new Company({ name: "Acme", slug: "acme", emailDomain: "not a domain" }),
        "emailDomain",
    );
    await assertValidationError(
        new Company({ name: "Acme", slug: "acme", status: "pending" }),
        "status",
    );
    await assertValidationError(
        new Company({ name: "Acme", slug: "acme", verificationStatus: "pending" }),
        "verificationStatus",
    );
});

test("CompanyMember supports many-to-many membership with separate roles", async () => {
    const companyA = new mongoose.Types.ObjectId();
    const companyB = new mongoose.Types.ObjectId();
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    const inviter = new mongoose.Types.ObjectId();

    const memberships = [
        new CompanyMember({
            company: companyA,
            user: userA,
            role: "owner",
            status: "active",
            invitedBy: inviter,
            joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        new CompanyMember({
            company: companyB,
            user: userA,
            role: "interviewer",
            status: "active",
        }),
        new CompanyMember({
            company: companyA,
            user: userB,
            role: "recruiter",
        }),
    ];

    for (const membership of memberships) {
        await membership.validate();
    }

    assert.equal(memberships[0].company, companyA);
    assert.equal(memberships[1].company, companyB);
    assert.equal(memberships[2].user, userB);
    assert.equal(memberships[2].status, "invited");
    assert.equal(memberships[2].invitedBy, null);
    assert.equal(memberships[2].joinedAt, null);
    assert.equal(CompanyMember.schema.path("company").options.ref, "Company");
    assert.equal(CompanyMember.schema.path("user").options.ref, "User");
    assert.equal(CompanyMember.schema.path("invitedBy").options.ref, "User");
    assert.notEqual(
        CompanyMember.schema.path("role").enumValues.includes("jobseeker"),
        true,
    );
    assert.ok(hasIndex(
        CompanyMember.schema,
        { company: 1, user: 1 },
        { unique: true },
    ));
    assert.ok(hasIndex(CompanyMember.schema, { company: 1, status: 1 }));
    assert.ok(hasIndex(CompanyMember.schema, { user: 1, status: 1 }));

    await assertValidationError(new CompanyMember({ user: userA, role: "owner" }), "company");
    await assertValidationError(new CompanyMember({ company: companyA, role: "owner" }), "user");
    await assertValidationError(
        new CompanyMember({ company: companyA, user: userA }),
        "role",
    );
    await assertValidationError(
        new CompanyMember({
            company: companyA,
            user: userA,
            role: "admin",
        }),
        "role",
    );
    await assertValidationError(
        new CompanyMember({
            company: companyA,
            user: userA,
            role: "owner",
            status: "pending",
        }),
        "status",
    );
});

test("EmailVerificationToken enforces expiration, single consumption, and indexes", async () => {
    const userId = new mongoose.Types.ObjectId();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expired = new EmailVerificationToken({
        user: userId,
        tokenHash: "expired-hash",
        expiresAt: new Date("2025-12-31T23:59:59.000Z"),
    });
    const valid = new EmailVerificationToken({
        user: userId,
        tokenHash: "valid-hash",
        expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    await expired.validate();
    await valid.validate();

    assert.equal(expired.isExpired(now), true);
    assert.equal(expired.isConsumed(), false);
    assert.equal(expired.isUsable(now), false);
    assert.equal(expired.consume(now), false);
    assert.equal(expired.consumedAt, null);

    assert.equal(valid.isUsable(now), true);
    assert.equal(valid.consume(now), true);
    assert.equal(valid.consumedAt, now);
    assert.equal(valid.isConsumed(), true);
    assert.equal(valid.isUsable(now), false);
    assert.equal(valid.consume(now), false);
    assert.ok(valid.createdAt instanceof Date);
    assert.equal(typeof EmailVerificationToken.findUsableByHash, "function");
    assert.equal(typeof EmailVerificationToken.consumeByHash, "function");
    assert.ok(hasIndex(
        EmailVerificationToken.schema,
        { tokenHash: 1 },
        { unique: true },
    ));
    assert.ok(hasIndex(
        EmailVerificationToken.schema,
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
    ));
    assert.ok(hasIndex(EmailVerificationToken.schema, { user: 1, consumedAt: 1 }));
    assert.equal(EmailVerificationToken.schema.path("user").options.ref, "User");

    await assertValidationError(
        new EmailVerificationToken({ tokenHash: "hash", expiresAt: now }),
        "user",
    );
    await assertValidationError(
        new EmailVerificationToken({ user: userId, expiresAt: now }),
        "tokenHash",
    );
    await assertValidationError(
        new EmailVerificationToken({ user: userId, tokenHash: "hash" }),
        "expiresAt",
    );
});

test("Existing job-seeker models remain compatible with the extended User model", async () => {
    const user = new User({
        name: "Existing Job Seeker",
        email: "jobseeker@example.com",
        password: "password123",
        timestamp: new Date("2025-01-01T00:00:00.000Z"),
    });

    await user.validate();
    assert.equal(user.role, "jobseeker");
    assert.equal(user.emailVerified, true);
    assert.equal(user.status, "active");
    assert.equal(user.timestamp.toISOString(), "2025-01-01T00:00:00.000Z");

    for (const Model of [
        Application,
        Resume,
        MatchingAnalysis,
        InterviewPrepSession,
    ]) {
        const userPath = Model.schema.path("user");
        assert.equal(userPath.options.ref, "User");
        assert.ok(userPath.options.required);
    }
});
