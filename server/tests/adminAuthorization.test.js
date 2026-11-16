const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-admin-authorization";

const User = require("../models/userModel");
const {
    protectAdmin,
    requireAdmin,
    adminOnly,
} = require("../middleware/adminAuth");
const { errorHandler } = require("../middleware/errorHandler");
const { buildActiveUser } = require("./helpers/authUserMock");

const originalFindById = User.findById;

const app = express();
app.get("/admin", protectAdmin, (req, res) => {
  res.json({ id: String(req.user._id), role: req.user.role });
});
app.use(errorHandler);

let adminUser;
let findByIdCalls;

const tokenFor = (id, claims = {}) =>
  jwt.sign({ id: String(id), ...claims }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });

const asAdmin = (requestBuilder, token) =>
  requestBuilder.set("Authorization", `Bearer ${token}`);

beforeEach(() => {
  findByIdCalls = [];
  adminUser = buildActiveUser({
    role: "admin",
    email: "admin@example.com",
  });

  User.findById = async (id, projection) => {
    findByIdCalls.push({ id, projection });

    return String(adminUser._id) === String(id) ? adminUser : null;
  };
});

after(() => {
  User.findById = originalFindById;
});

test("exports reusable admin authorization aliases", () => {
  assert.equal(typeof requireAdmin, "function");
  assert.equal(adminOnly, requireAdmin);
  assert.equal(Array.isArray(protectAdmin), true);
  assert.equal(protectAdmin.includes(requireAdmin), true);
});

test("allows a database-backed admin", async () => {
  const response = await asAdmin(
    request(app).get("/admin"),
    tokenFor(adminUser._id),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: String(adminUser._id),
    role: "admin",
  });
  assert.equal(findByIdCalls.length, 1);
  assert.equal(findByIdCalls[0].projection, "-password");
});

test("denies jobseeker and HR users", async () => {
  for (const role of ["jobseeker", "hr"]) {
    adminUser.role = role;
    const response = await asAdmin(
      request(app).get("/admin"),
      tokenFor(adminUser._id, { role: "admin" }),
    );

    assert.equal(response.status, 403, role);
    assert.deepEqual(response.body, {
      message: "Forbidden, insufficient permissions",
    });
  }
});

test("requires authentication and rejects inactive or deleted admins", async () => {
  const unauthenticated = await request(app).get("/admin");

  adminUser.status = "suspended";
  const suspended = await asAdmin(
    request(app).get("/admin"),
    tokenFor(adminUser._id),
  );

  const deleted = await asAdmin(
    request(app).get("/admin"),
    tokenFor(new mongoose.Types.ObjectId()),
  );

  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(unauthenticated.body, {
    message: "Not authorized, no token provided",
  });

  for (const response of [suspended, deleted]) {
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      message: "Not authorized, invalid or inactive user",
    });
  }
});

test("ignores JWT role claims, headers, query parameters, and request bodies", async () => {
  adminUser.role = "jobseeker";
  const escalationToken = tokenFor(adminUser._id, { role: "admin" });

  const response = await asAdmin(
    request(app)
      .get("/admin?role=admin")
      .set("x-role", "admin")
      .send({ role: "admin", status: "active" }),
    escalationToken,
  );

  assert.equal(response.status, 403);
  assert.equal(adminUser.role, "jobseeker");
});
