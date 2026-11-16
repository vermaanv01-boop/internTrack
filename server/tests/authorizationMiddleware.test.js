const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-authorization-middleware";

const User = require("../models/userModel");
const Company = require("../models/companyModel");
const CompanyMember = require("../models/companyMemberModel");
const {
  protect,
  requireRole,
  requireVerified,
  requireCompanyMember,
  requireCompanyRole,
} = require("../middleware/authMiddleware");
const { errorHandler } = require("../middleware/errorHandler");
const { buildActiveUser } = require("./helpers/authUserMock");

const originalMethods = {
  findById: User.findById,
  companyFindById: Company.findById,
  memberFindOne: CompanyMember.findOne,
};

const app = express();
app.use(express.json());
app.get("/jobseeker", protect, (req, res) => {
  res.json({ id: req.user.id, role: req.user.role });
});
app.get("/admin", protect, requireRole("admin"), (req, res) => {
  res.json({ role: req.user.role });
});
app.get("/hr-or-admin", protect, requireRole("hr", "admin"), (req, res) => {
  res.json({ role: req.user.role });
});
app.get("/verified", protect, requireVerified, (req, res) => {
  res.json({ emailVerified: req.user.emailVerified });
});
app.get(
  "/hr-verified",
  protect,
  requireRole("hr"),
  requireVerified,
  (req, res) => res.json({ role: req.user.role }),
);
app.get(
  "/companies/:companyId",
  protect,
  requireCompanyMember,
  (req, res) => {
    res.json({
      companyId: String(req.company._id),
      companyName: req.company.name,
      membershipRole: req.companyMember.role,
    });
  },
);
app.get(
  "/companies/:companyId/owner",
  protect,
  requireCompanyMember,
  requireCompanyRole("owner"),
  (req, res) => res.json({ role: req.companyMember.role }),
);
app.get(
  "/companies/:companyId/recruit",
  protect,
  requireCompanyMember,
  requireCompanyRole("owner", "recruiter"),
  (req, res) => res.json({ role: req.companyMember.role }),
);
app.get(
  "/companies/:companyId/interview",
  protect,
  requireCompanyMember,
  requireCompanyRole("owner", "interviewer"),
  (req, res) => res.json({ role: req.companyMember.role }),
);
app.use(errorHandler);

let userId;
let companyId;
let activeUser;
let companies;
let memberships;
let findByIdCalls;

const tokenFor = (id, options = {}) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
    ...options,
  });

const addCompany = (overrides = {}) => {
  const company = {
    _id: companyId,
    name: "Acme Corp",
    slug: "acme-corp",
    status: "active",
    ...overrides,
  };

  companies.set(String(company._id), company);
  return company;
};

const addMembership = (overrides = {}) => {
  const membership = {
    _id: new mongoose.Types.ObjectId(),
    company: companyId,
    user: activeUser._id,
    role: "owner",
    status: "active",
    ...overrides,
  };
  const key = `${String(membership.company)}:${String(membership.user)}`;

  memberships.set(key, membership);
  return membership;
};

beforeEach(() => {
  userId = new mongoose.Types.ObjectId();
  companyId = new mongoose.Types.ObjectId();
  activeUser = buildActiveUser({ id: userId });
  companies = new Map();
  memberships = new Map();
  findByIdCalls = [];

  User.findById = async (id, projection) => {
    findByIdCalls.push({ id, projection });

    if (String(activeUser._id) !== String(id)) {
      return null;
    }

    return activeUser;
  };
  Company.findById = async (id) => companies.get(String(id)) || null;
  CompanyMember.findOne = async (filter) => {
    return memberships.get(`${String(filter.company)}:${String(filter.user)}`) || null;
  };
});

after(() => {
  User.findById = originalMethods.findById;
  Company.findById = originalMethods.companyFindById;
  CompanyMember.findOne = originalMethods.memberFindOne;
});

const asUser = (requestBuilder, token = tokenFor(String(userId))) =>
  requestBuilder.set("Authorization", `Bearer ${token}`);

test("rejects missing, malformed, expired, and invalid JWTs without loading a user", async () => {
  const unauthenticated = await request(app).get("/jobseeker");
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(unauthenticated.body, {
    message: "Not authorized, no token provided",
  });

  for (const header of ["Basic abc123", "Bearer", "Bearer first second", "Bearer not-a-jwt"]) {
    const response = await request(app)
      .get("/jobseeker")
      .set("Authorization", header);

    assert.equal(response.status, 401, header);
  }

  const expired = await asUser(
    request(app).get("/jobseeker"),
    tokenFor(String(userId), { expiresIn: -1 }),
  );
  const badSignature = await asUser(
    request(app).get("/jobseeker"),
    jwt.sign({ id: String(userId) }, "wrong-secret"),
  );
  const invalidPayload = await asUser(
    request(app).get("/jobseeker"),
    tokenFor("not-an-object-id"),
  );

  assert.equal(expired.status, 401);
  assert.equal(badSignature.status, 401);
  assert.equal(invalidPayload.status, 401);
  assert.deepEqual(invalidPayload.body, {
    message: "Not authorized, invalid token payload",
  });
  assert.equal(findByIdCalls.length, 0);
});

test("rejects deleted, suspended, and invalid database-backed users", async () => {
  const deleted = await asUser(
    request(app).get("/jobseeker"),
    tokenFor(String(new mongoose.Types.ObjectId())),
  );

  activeUser.status = "suspended";
  const suspended = await asUser(request(app).get("/jobseeker"));

  activeUser.status = "active";
  activeUser.role = "superadmin";
  const invalidRole = await asUser(request(app).get("/jobseeker"));

  for (const response of [deleted, suspended, invalidRole]) {
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      message: "Not authorized, invalid or inactive user",
    });
  }
});

test("uses database roles and ignores role claims, query parameters, and headers", async () => {
  const escalationToken = jwt.sign(
    { id: String(userId), role: "admin" },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );

  const jobseekerRoute = await asUser(
    request(app).get("/jobseeker?role=admin").set("x-role", "admin"),
    escalationToken,
  );
  const adminRoute = await asUser(
    request(app)
      .get("/admin?role=admin")
      .set("x-role", "admin")
      .send({ role: "admin" }),
    escalationToken,
  );

  assert.equal(jobseekerRoute.status, 200);
  assert.equal(jobseekerRoute.body.role, "jobseeker");
  assert.equal(adminRoute.status, 403);
  assert.deepEqual(adminRoute.body, {
    message: "Forbidden, insufficient permissions",
  });

  activeUser.role = "admin";
  const refreshedRole = await asUser(request(app).get("/admin"), escalationToken);

  assert.equal(refreshedRole.status, 200);
  assert.equal(refreshedRole.body.role, "admin");
  assert.equal(findByIdCalls.length, 3);
});

test("supports multiple platform roles and rejects authenticated users without them", async () => {
  activeUser.role = "hr";
  const hr = await asUser(request(app).get("/hr-or-admin"));

  activeUser.role = "admin";
  const admin = await asUser(request(app).get("/hr-or-admin"));

  activeUser.role = "jobseeker";
  const jobseeker = await asUser(request(app).get("/hr-or-admin"));

  assert.equal(hr.status, 200);
  assert.equal(admin.status, 200);
  assert.equal(jobseeker.status, 403);
});

test("keeps email verification separate from authentication", async () => {
  activeUser.role = "hr";
  activeUser.emailVerified = false;

  const authenticated = await asUser(request(app).get("/jobseeker"));
  const unverified = await asUser(request(app).get("/verified"));
  const unverifiedHr = await asUser(request(app).get("/hr-verified"));

  assert.equal(authenticated.status, 200);
  assert.equal(unverified.status, 403);
  assert.deepEqual(unverified.body, {
    message: "Forbidden, email verification required",
  });
  assert.equal(unverifiedHr.status, 403);

  activeUser.emailVerified = true;
  const verified = await asUser(request(app).get("/verified"));

  assert.equal(verified.status, 200);
  assert.equal(verified.body.emailVerified, true);
});

test("attaches active company context and membership for an HR member", async () => {
  activeUser.role = "hr";
  const company = addCompany();
  const membership = addMembership({ role: "owner" });

  const response = await asUser(
    request(app).get(`/companies/${company._id}`),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    companyId: String(company._id),
    companyName: company.name,
    membershipRole: membership.role,
  });
});

test("rejects missing, inactive, and cross-company memberships", async () => {
  activeUser.role = "hr";
  addCompany();

  const missing = await asUser(
    request(app).get(`/companies/${companyId}`),
  );

  const membership = addMembership({ status: "suspended" });
  const suspendedMembership = await asUser(
    request(app).get(`/companies/${companyId}`),
  );

  membership.status = "removed";
  const removedMembership = await asUser(
    request(app).get(`/companies/${companyId}`),
  );

  const otherCompanyId = new mongoose.Types.ObjectId();
  const crossCompany = await asUser(
    request(app)
      .post(`/companies/${otherCompanyId}`)
      .send({ companyId: String(companyId) }),
  );

  for (const response of [
    missing,
    suspendedMembership,
    removedMembership,
    crossCompany,
  ]) {
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      message: "Forbidden, company access denied",
    });
  }
});

test("rejects suspended companies even when membership is active", async () => {
  activeUser.role = "hr";
  addCompany({ status: "suspended" });
  addMembership({ role: "owner" });

  const response = await asUser(
    request(app).get(`/companies/${companyId}`),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    message: "Forbidden, company access denied",
  });
});

test("rejects invalid company identifiers before querying company data", async () => {
  activeUser.role = "hr";
  addCompany();
  addMembership();

  const response = await asUser(
    request(app).get("/companies/not-an-object-id"),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { message: "Invalid company ID" });
});

test("requires an HR platform role and does not let admins bypass company membership", async () => {
  addCompany();

  activeUser.role = "jobseeker";
  addMembership({ role: "owner" });
  const jobseeker = await asUser(
    request(app).get(`/companies/${companyId}`),
  );

  activeUser.role = "admin";
  const adminWithMembership = await asUser(
    request(app).get(`/companies/${companyId}`),
  );

  assert.equal(jobseeker.status, 403);
  assert.equal(adminWithMembership.status, 403);
});

test("enforces owner, recruiter, and interviewer company roles", async () => {
  activeUser.role = "hr";
  addCompany();
  const membership = addMembership({ role: "owner" });

  const owner = await asUser(
    request(app).get(`/companies/${companyId}/owner`),
  );

  membership.role = "recruiter";
  const recruiterManage = await asUser(
    request(app).get(`/companies/${companyId}/recruit`),
  );
  const recruiterOwner = await asUser(
    request(app).get(`/companies/${companyId}/owner`),
  );

  membership.role = "interviewer";
  const interviewer = await asUser(
    request(app).get(`/companies/${companyId}/interview`),
  );
  const interviewerManage = await asUser(
    request(app).get(`/companies/${companyId}/recruit`),
  );

  assert.equal(owner.status, 200);
  assert.equal(recruiterManage.status, 200);
  assert.equal(recruiterOwner.status, 403);
  assert.equal(interviewer.status, 200);
  assert.equal(interviewerManage.status, 403);
});

test("rejects company middleware when authentication or company context is missing", async () => {
  const unauthenticated = await request(app).get(
    `/companies/${companyId}`,
  );

  const noContextApp = express();
  noContextApp.get(
    "/company-role",
    requireCompanyRole("owner"),
    (req, res) => res.json({ ok: true }),
  );

  const noContext = await request(noContextApp).get("/company-role");

  assert.equal(unauthenticated.status, 401);
  assert.equal(noContext.status, 403);
  assert.deepEqual(noContext.body, {
    message: "Forbidden, company access denied",
  });
});
