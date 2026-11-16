const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-hr-auth";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.EMAIL_VERIFICATION_URL = "http://localhost:5173/verify-email";
process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = "60";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.EMAIL_VERIFICATION_RATE_LIMIT_MAX = "1000";
process.env.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX = "1000";

const User = require("../models/userModel");
const Company = require("../models/companyModel");
const CompanyMember = require("../models/companyMemberModel");
const EmailVerificationToken = require("../models/emailVerificationTokenModel");
const hrAuthRoutes = require("../routes/hrAuthRoutes");
const emailService = require("../services/emailService");
const { onboardHrUser } = require("../services/hrOnboarding");
const { hashVerificationToken } = require("../utils/verificationToken");
const { protect, requireRole, requireVerified } = require("../middleware/authMiddleware");
const { errorHandler } = require("../middleware/errorHandler");

const originalMethods = {
  userFindOne: User.findOne,
  userCreate: User.create,
  userFindById: User.findById,
  userFindOneAndUpdate: User.findOneAndUpdate,
  companyFindOne: Company.findOne,
  companyFindById: Company.findById,
  companyFindOneAndUpdate: Company.findOneAndUpdate,
  memberFindOne: CompanyMember.findOne,
  memberFindOneAndUpdate: CompanyMember.findOneAndUpdate,
  tokenCreate: EmailVerificationToken.create,
  tokenFindUsableByHash: EmailVerificationToken.findUsableByHash,
  tokenConsumeByHash: EmailVerificationToken.consumeByHash,
  tokenUpdateMany: EmailVerificationToken.updateMany,
  sendVerificationEmail: emailService.sendVerificationEmail,
};

const app = express();
app.use(express.json());
app.use("/api/hr/auth", hrAuthRoutes);
app.get(
  "/api/hr/protected",
  protect,
  requireRole("hr"),
  requireVerified,
  (req, res) => res.json({ id: req.user.id, role: req.user.role }),
);
app.use(errorHandler);

let users;
let companies;
let memberships;
let tokens;
let sentEmails;
let failMembershipUpsertOnce;

const matches = (record, filter) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === "_id") {
      return String(record._id) === String(value);
    }

    return String(record[key]) === String(value);
  });

const buildUser = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "HR Person",
  email: "hr@example.com",
  password: "hashed-password",
  role: "hr",
  emailVerified: false,
  status: "active",
  pendingCompanyName: "Acme Labs",
  pendingCompanyWebsite: "https://acme.example.com",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const buildToken = (userId, overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  user: userId,
  tokenHash: crypto.randomBytes(32).toString("hex"),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  consumedAt: null,
  createdAt: new Date(),
  ...overrides,
});

const registrationPayload = (overrides = {}) => ({
  name: "HR Person",
  email: "hr@example.com",
  password: "password123",
  companyName: "Acme Labs",
  companyWebsite: "https://acme.example.com",
  ...overrides,
});

const register = (overrides = {}) =>
  request(app)
    .post("/api/hr/auth/register")
    .send(registrationPayload(overrides));

const verify = (token) =>
  request(app).post("/api/hr/auth/verify-email").send({ token });

const resend = (email) =>
  request(app).post("/api/hr/auth/resend-verification").send({ email });

const hrTokenFor = (id) =>
  jwt.sign({ id: String(id) }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });

beforeEach(() => {
  users = [];
  companies = [];
  memberships = [];
  tokens = [];
  sentEmails = [];
  failMembershipUpsertOnce = false;

  User.findOne = async (filter) => users.find((user) => matches(user, filter)) || null;
  User.create = async (data) => {
    const user = {
      _id: new mongoose.Types.ObjectId(),
      ...data,
      createdAt: new Date(),
    };

    users.push(user);
    return user;
  };
  User.findById = async (id) =>
    users.find((user) => String(user._id) === String(id)) || null;
  User.findOneAndUpdate = async (filter, update) => {
    const user = users.find((candidate) => matches(candidate, filter));

    if (!user) {
      return null;
    }

    Object.assign(user, update.$set || {});
    return user;
  };

  Company.findOne = async (filter) =>
    companies.find((company) => matches(company, filter)) || null;
  Company.findById = async (id) =>
    companies.find((company) => String(company._id) === String(id)) || null;
  Company.findOneAndUpdate = async (filter, update, options) => {
    let company = companies.find((candidate) => matches(candidate, filter));

    if (!company) {
      if (!options || !options.upsert) {
        return null;
      }

      company = {
        _id: new mongoose.Types.ObjectId(),
        ...(update.$setOnInsert || {}),
        createdAt: new Date(),
      };
      companies.push(company);
    }

    Object.assign(company, update.$setOnInsert || {}, update.$set || {});
    return company;
  };

  CompanyMember.findOne = async (filter) =>
    memberships.find((membership) => matches(membership, filter)) || null;
  CompanyMember.findOneAndUpdate = async (filter, update, options) => {
    if (failMembershipUpsertOnce) {
      failMembershipUpsertOnce = false;
      throw new Error("Simulated membership persistence failure");
    }

    let membership = memberships.find((candidate) =>
      matches(candidate, filter),
    );

    if (!membership) {
      if (!options || !options.upsert) {
        return null;
      }

      membership = {
        _id: new mongoose.Types.ObjectId(),
        ...filter,
        ...(update.$setOnInsert || {}),
      };
      memberships.push(membership);
    }

    Object.assign(membership, update.$setOnInsert || {}, update.$set || {});
    return membership;
  };

  EmailVerificationToken.create = async (data) => {
    const token = {
      _id: new mongoose.Types.ObjectId(),
      ...data,
      consumedAt: null,
    };
    tokens.push(token);
    return token;
  };
  EmailVerificationToken.findUsableByHash = async (tokenHash, now) =>
    tokens.find(
      (token) =>
        token.tokenHash === tokenHash &&
        !token.consumedAt &&
        new Date(token.expiresAt).getTime() > new Date(now).getTime(),
    ) || null;
  EmailVerificationToken.consumeByHash = async (tokenHash, now) => {
    const token = tokens.find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        !candidate.consumedAt &&
        new Date(candidate.expiresAt).getTime() > new Date(now).getTime(),
    );

    if (!token) {
      return null;
    }

    token.consumedAt = now;
    return token;
  };
  EmailVerificationToken.updateMany = async (filter, update) => {
    let modifiedCount = 0;

    for (const token of tokens) {
      if (matches(token, filter)) {
        token.consumedAt = update.$set.consumedAt;
        modifiedCount += 1;
      }
    }

    return { modifiedCount };
  };

  emailService.sendVerificationEmail = async ({ to, name, token }) => {
    sentEmails.push({ to, name, token });
  };
});

after(() => {
  User.findOne = originalMethods.userFindOne;
  User.create = originalMethods.userCreate;
  User.findById = originalMethods.userFindById;
  User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
  Company.findOne = originalMethods.companyFindOne;
  Company.findById = originalMethods.companyFindById;
  Company.findOneAndUpdate = originalMethods.companyFindOneAndUpdate;
  CompanyMember.findOne = originalMethods.memberFindOne;
  CompanyMember.findOneAndUpdate = originalMethods.memberFindOneAndUpdate;
  EmailVerificationToken.create = originalMethods.tokenCreate;
  EmailVerificationToken.findUsableByHash = originalMethods.tokenFindUsableByHash;
  EmailVerificationToken.consumeByHash = originalMethods.tokenConsumeByHash;
  EmailVerificationToken.updateMany = originalMethods.tokenUpdateMany;
  emailService.sendVerificationEmail = originalMethods.sendVerificationEmail;
});

test("registers an HR account with server-owned role and hashed verification token", async () => {
  const response = await request(app)
    .post("/api/hr/auth/register")
    .send(
      registrationPayload({
        role: "admin",
        emailVerified: true,
        status: "suspended",
        membership: { role: "owner" },
      }),
    );

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "hr");
  assert.equal(response.body.user.emailVerified, false);
  assert.equal(response.body.token, undefined);
  assert.equal(JSON.stringify(response.body).includes("password"), false);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, "hr");
  assert.equal(users[0].emailVerified, false);
  assert.equal(users[0].status, "active");
  assert.equal(users[0].pendingCompanyName, "Acme Labs");
  assert.equal(users[0].pendingCompanyWebsite, "https://acme.example.com");
  assert.notEqual(users[0].password, "password123");
  assert.equal(await bcrypt.compare("password123", users[0].password), true);
  assert.equal(companies.length, 0);
  assert.equal(memberships.length, 0);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "hr@example.com");
  assert.equal(sentEmails[0].name, "HR Person");
  assert.equal(tokens.length, 1);
  assert.notEqual(tokens[0].tokenHash, sentEmails[0].token);
  assert.equal(tokens[0].tokenHash, hashVerificationToken(sentEmails[0].token));
  assert.equal(JSON.stringify(tokens[0]).includes(sentEmails[0].token), false);
  assert.equal(new Date(tokens[0].expiresAt) > new Date(), true);
});

test("validates registration input before any persistence or email delivery", async () => {
  const invalidPayloads = [
    registrationPayload({ name: "" }),
    registrationPayload({ email: "not-an-email" }),
    registrationPayload({ password: "short" }),
    registrationPayload({ companyName: "" }),
    registrationPayload({ companyWebsite: "javascript:alert(1)" }),
  ];

  for (const payload of invalidPayloads) {
    const response = await request(app)
      .post("/api/hr/auth/register")
      .send(payload);

    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.equal(response.body.message, "Validation failed");
  }

  assert.equal(users.length, 0);
  assert.equal(tokens.length, 0);
  assert.equal(sentEmails.length, 0);
});

test("rejects duplicate HR and job-seeker email addresses without leaking account data", async () => {
  users.push(buildUser({ email: "existing@example.com", role: "jobseeker" }));

  const response = await register({ email: "existing@example.com" });

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "User already exists");
  assert.equal(users.length, 1);
  assert.equal(tokens.length, 0);
  assert.equal(sentEmails.length, 0);
});

test("resends verification with a new single-use token and invalidates the previous token", async () => {
  await register();
  const originalToken = tokens[0];
  const originalRawToken = sentEmails[0].token;

  const response = await resend("hr@example.com");

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "If an unverified HR account exists, a verification email has been sent.");
  assert.equal(sentEmails.length, 2);
  assert.notEqual(sentEmails[1].token, originalRawToken);
  assert.ok(originalToken.consumedAt);
  assert.equal(tokens.length, 2);
  assert.equal(
    tokens[1].tokenHash,
    hashVerificationToken(sentEmails[1].token),
  );
  assert.equal(
    await EmailVerificationToken.findUsableByHash(
      hashVerificationToken(originalRawToken),
      new Date(),
    ),
    null,
  );
});

test("resend is generic for unknown, verified, and non-HR accounts", async () => {
  users.push(
    buildUser({ email: "active-hr@example.com", emailVerified: true }),
    buildUser({ email: "jobseeker@example.com", role: "jobseeker" }),
    buildUser({ email: "suspended@example.com", status: "suspended" }),
  );

  for (const email of [
    "missing@example.com",
    "active-hr@example.com",
    "jobseeker@example.com",
    "suspended@example.com",
  ]) {
    const response = await resend(email);

    assert.equal(response.status, 200);
    assert.equal(
      response.body.message,
      "If an unverified HR account exists, a verification email has been sent.",
    );
  }

  assert.equal(sentEmails.length, 0);
  assert.equal(tokens.length, 0);
});

test("verifies an HR email, onboards the owner company, and issues a post-verification JWT", async () => {
  const registration = await register();
  const rawToken = sentEmails[0].token;

  const unverifiedAccess = await request(app)
    .get("/api/hr/protected")
    .set("Authorization", `Bearer ${hrTokenFor(registration.body.user._id)}`);

  assert.equal(unverifiedAccess.status, 403);
  assert.deepEqual(unverifiedAccess.body, {
    message: "Forbidden, email verification required",
  });

  const response = await verify(rawToken);

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Email verified successfully");
  assert.equal(response.body.user.role, "hr");
  assert.equal(response.body.user.emailVerified, true);
  assert.equal(response.body.company.name, "Acme Labs");
  assert.match(response.body.company.slug, /^acme-labs-[a-f0-9]{8}$/);
  assert.equal(response.body.company.status, "active");
  assert.equal(response.body.company.verificationStatus, "self_registered");
  assert.equal(response.body.membership.role, "owner");
  assert.equal(response.body.membership.status, "active");
  assert.equal(users[0].emailVerified, true);
  assert.equal(companies.length, 1);
  assert.equal(memberships.length, 1);
  assert.equal(companies[0].website, "https://acme.example.com");
  assert.equal(companies[0].emailDomain, "example.com");
  assert.equal(String(memberships[0].company), String(companies[0]._id));
  assert.equal(String(memberships[0].user), String(users[0]._id));
  assert.ok(tokens[0].consumedAt);
  assert.equal(JSON.stringify(response.body).includes("password"), false);
  assert.equal(JSON.stringify(response.body).includes("pendingCompany"), false);

  const payload = jwt.verify(response.body.token, process.env.JWT_SECRET);
  assert.equal(payload.id, String(users[0]._id));
  assert.equal(payload.role, undefined);
  assert.equal(payload.emailVerified, undefined);

  const verifiedAccess = await request(app)
    .get("/api/hr/protected")
    .set("Authorization", `Bearer ${response.body.token}`);

  assert.equal(verifiedAccess.status, 200);
  assert.equal(verifiedAccess.body.role, "hr");

  const replay = await verify(rawToken);

  assert.equal(replay.status, 400);
  assert.deepEqual(replay.body, {
    message: "Invalid or expired verification token",
  });
  assert.equal(companies.length, 1);
  assert.equal(memberships.length, 1);
});

test("rejects missing, malformed, expired, and consumed verification tokens", async () => {
  const missing = await request(app)
    .post("/api/hr/auth/verify-email")
    .send({});

  assert.equal(missing.status, 400);
  assert.equal(missing.body.errors.token, "Verification token is required");

  const invalid = await verify("not-a-real-token");

  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, {
    message: "Invalid or expired verification token",
  });

  await register();
  const expiredHash = tokens[0].tokenHash;
  const expiredRawToken = sentEmails[0].token;
  tokens[0].expiresAt = new Date(Date.now() - 1000);
  const expired = await verify(expiredRawToken);

  assert.equal(expired.status, 400);
  assert.equal(
    await EmailVerificationToken.findUsableByHash(expiredHash, new Date()),
    null,
  );

  tokens[0].expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  tokens[0].consumedAt = new Date();
  const consumed = await verify(expiredRawToken);

  assert.equal(consumed.status, 400);
  assert.equal(companies.length, 0);
  assert.equal(memberships.length, 0);
});

test("handles concurrent verification of the same token with exactly one success", async () => {
  await register();
  const rawToken = sentEmails[0].token;

  const [first, second] = await Promise.all([verify(rawToken), verify(rawToken)]);
  const statuses = [first.status, second.status].sort((a, b) => a - b);

  assert.deepEqual(statuses, [200, 400]);
  assert.equal(companies.length, 1);
  assert.equal(memberships.length, 1);
  assert.equal(users[0].emailVerified, true);
});

test("company onboarding is idempotent when retried after success", async () => {
  await register();
  const response = await verify(sentEmails[0].token);
  const companyId = response.body.company._id;
  const membershipId = response.body.membership._id;

  const retried = await onboardHrUser({ user: users[0] });

  assert.equal(String(retried.company._id), String(companyId));
  assert.equal(String(retried.membership._id), String(membershipId));
  assert.equal(companies.length, 1);
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].role, "owner");
  assert.equal(memberships[0].status, "active");
});

test("a partial onboarding failure does not consume the token and can be retried safely", async () => {
  await register();
  failMembershipUpsertOnce = true;

  const failed = await verify(sentEmails[0].token);

  assert.equal(failed.status, 500);
  assert.equal(tokens[0].consumedAt, null);
  assert.equal(users[0].emailVerified, false);
  assert.equal(companies.length, 1);
  assert.equal(memberships.length, 0);

  const retried = await verify(sentEmails[0].token);

  assert.equal(retried.status, 200);
  assert.ok(tokens[0].consumedAt);
  assert.equal(users[0].emailVerified, true);
  assert.equal(companies.length, 1);
  assert.equal(memberships.length, 1);
});

test("email delivery failures return a generic 503 without exposing the raw token", async () => {
  let attemptedToken;

  emailService.sendVerificationEmail = async ({ token }) => {
    attemptedToken = token;
    const error = new Error("SMTP unavailable");
    error.code = "ESOCKET";
    throw error;
  };

  const response = await register();

  assert.equal(response.status, 503);
  assert.equal(
    response.body.message,
    "The verification email could not be sent. Please try resending it later.",
  );
  assert.ok(attemptedToken);
  assert.equal(JSON.stringify(response.body).includes(attemptedToken), false);
  assert.equal(tokens.length, 1);
  assert.equal(companies.length, 0);
  assert.equal(memberships.length, 0);
  assert.equal(users[0].emailVerified, false);
});
