const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "test-jwt-secret-e2e-suite";

const User = require("../models/userModel");
const Application = require("../models/applicationModel");
const Resume = require("../models/resumeModel");
const MatchingAnalysis = require("../models/matchingAnalysisModel");
const InterviewPrepSession = require("../models/interviewPrepSessionModel");

const userRoutes = require("../routes/userRoutes");
const applicationRoutes = require("../routes/applicationRoutes");
const analyticsRoutes = require("../routes/analyticsRoutes");
const resumeRoutes = require("../routes/resumeRoutes");
const matchingRoutes = require("../routes/matchingRoutes");
const interviewPrepRoutes = require("../routes/interviewPrepRoutes");

const app = express();
app.use(express.json());
app.use("/api/users", userRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/matching", matchingRoutes);
app.use("/api/interview-prep", interviewPrepRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    return res.status(500).json({ message: "Server error", error: error.message });
});

// Mock In-Memory Store for User, Application, Analytics
let users = [];
let applications = [];

// Intercept User Model
User.findOne = async (filter) => {
    return users.find((u) => u.email === filter.email) || null;
};
User.create = async (data) => {
    const doc = {
        _id: new mongoose.Types.ObjectId(),
        ...data,
        createdAt: new Date(),
    };
    users.push(doc);
    return doc;
};
User.findByIdAndUpdate = async (id, update) => {
    const user = users.find((u) => String(u._id) === String(id));
    if (user) {
        Object.assign(user, update);
    }
    return user;
};

// Intercept Application Model
Application.find = (filter) => {
    let result = applications.filter((a) => String(a.user) === String(filter.user));
    if (filter.status) {
        result = result.filter((a) => a.status === filter.status);
    }
    if (filter.$or) {
        result = result.filter((a) => {
            return filter.$or.some((clause) => {
                const key = Object.keys(clause)[0];
                return clause[key].test(a[key]);
            });
        });
    }
    return {
        sort: (sortObj) => ({
            skip: (skipNum) => ({
                limit: async (limitNum) => result.slice(skipNum, skipNum + limitNum),
            }),
        }),
    };
};
Application.countDocuments = async (filter) => {
    let result = applications.filter((a) => String(a.user) === String(filter.user));
    if (filter.status) result = result.filter((a) => a.status === filter.status);
    return result.length;
};
Application.findOne = async (filter) => {
    return applications.find((a) => String(a._id) === String(filter._id) && String(a.user) === String(filter.user)) || null;
};
Application.create = async (data) => {
    const doc = {
        _id: new mongoose.Types.ObjectId(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    applications.push(doc);
    return doc;
};
Application.findOneAndUpdate = async (filter, update) => {
    const app = applications.find((a) => String(a._id) === String(filter._id) && String(a.user) === String(filter.user));
    if (app) {
        Object.assign(app, update, { updatedAt: new Date() });
    }
    return app;
};
Application.findOneAndDelete = async (filter) => {
    const idx = applications.findIndex((a) => String(a._id) === String(filter._id) && String(a.user) === String(filter.user));
    if (idx !== -1) {
        const removed = applications.splice(idx, 1)[0];
        return removed;
    }
    return null;
};
Application.aggregate = async (pipeline) => {
    // Return structured aggregation data for analytics
    const userId = pipeline[0].$match.user;
    const userApps = applications.filter((a) => String(a.user) === String(userId));
    
    const statusCounts = {};
    for (const app of userApps) {
        statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
    }
    const pipelineRows = Object.entries(statusCounts).map(([status, count]) => ({ _id: status, count }));

    return [{
        overview: [{
            totalApplications: userApps.length,
            applicationsThisMonth: userApps.length,
            applicationsThisWeek: userApps.length,
        }],
        pipeline: pipelineRows,
        trend: [
            { _id: "2026-05", count: userApps.length },
        ],
        recent: userApps.slice(-5).map((a) => ({
            company: a.company,
            role: a.role,
            status: a.status,
            createdAt: a.createdAt,
        })),
    }];
};

beforeEach(() => {
    users = [];
    applications = [];
});

test("E2E User Flow 1: Authentication lifecycle", async () => {
    // 1. Register
    const regRes = await request(app)
        .post("/api/users/register")
        .send({ name: "Alice Developer", email: "alice@example.com", password: "password123" });
    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.user.name, "Alice Developer");
    assert.equal(regRes.body.user.email, "alice@example.com");

    // 2. Reject duplicate email
    const dupRes = await request(app)
        .post("/api/users/register")
        .send({ name: "Alice Duplicate", email: "alice@example.com", password: "password123" });
    assert.equal(dupRes.status, 400);
    assert.equal(dupRes.body.errors.email, "An account with this email already exists");

    // 3. Reject bad credentials
    const badLogin = await request(app)
        .post("/api/users/login")
        .send({ email: "alice@example.com", password: "wrongpassword" });
    assert.equal(badLogin.status, 400);

    // 4. Successful Login
    const loginRes = await request(app)
        .post("/api/users/login")
        .send({ email: "alice@example.com", password: "password123" });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.user.email, "alice@example.com");

    // 5. Logout
    const logoutRes = await request(app)
        .post("/api/users/logout");
    assert.equal(logoutRes.status, 200);
});

test("E2E User Flow 2: Application CRUD, Filtering, and Isolation", async () => {
    const user1Id = new mongoose.Types.ObjectId().toString();
    const user2Id = new mongoose.Types.ObjectId().toString();
    const token1 = jwt.sign({ id: user1Id }, process.env.JWT_SECRET);
    const token2 = jwt.sign({ id: user2Id }, process.env.JWT_SECRET);

    // Create app for user1
    const createRes = await request(app)
        .post("/api/applications")
        .set("Authorization", `Bearer ${token1}`)
        .send({
            company: "Google",
            role: "Software Engineering Intern",
            status: "applied",
            location: "Mountain View, CA",
            jobUrl: "https://careers.google.com/jobs/123",
        });
    assert.equal(createRes.status, 201);
    const appId = createRes.body.application._id;

    // User 1 lists applications
    const listRes1 = await request(app)
        .get("/api/applications")
        .set("Authorization", `Bearer ${token1}`);
    assert.equal(listRes1.status, 200);
    assert.equal(listRes1.body.applications.length, 1);
    assert.equal(listRes1.body.applications[0].company, "Google");

    // User 2 cannot see User 1's applications (Isolation)
    const listRes2 = await request(app)
        .get("/api/applications")
        .set("Authorization", `Bearer ${token2}`);
    assert.equal(listRes2.status, 200);
    assert.equal(listRes2.body.applications.length, 0);

    // User 2 cannot access or edit User 1's application by ID (404)
    const crossGet = await request(app)
        .get(`/api/applications/${appId}`)
        .set("Authorization", `Bearer ${token2}`);
    assert.equal(crossGet.status, 404);

    const crossUpdate = await request(app)
        .put(`/api/applications/${appId}`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ status: "offer" });
    assert.equal(crossUpdate.status, 404);

    // User 1 updates status to interview
    const updateRes = await request(app)
        .put(`/api/applications/${appId}`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ status: "interview" });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.application.status, "interview");

    // User 1 checks analytics dashboard
    const analyticsRes = await request(app)
        .get("/api/analytics/dashboard")
        .set("Authorization", `Bearer ${token1}`);
    assert.equal(analyticsRes.status, 200);
    assert.equal(analyticsRes.body.overview.totalApplications, 1);
    assert.equal(analyticsRes.body.overview.interviews, 1);

    // User 1 deletes application
    const deleteRes = await request(app)
        .delete(`/api/applications/${appId}`)
        .set("Authorization", `Bearer ${token1}`);
    assert.equal(deleteRes.status, 200);

    // Confirm deleted
    const getDeleted = await request(app)
        .get(`/api/applications/${appId}`)
        .set("Authorization", `Bearer ${token1}`);
    assert.equal(getDeleted.status, 404);
});

