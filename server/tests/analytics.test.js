const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-for-analytics-tests";

const Application = require("../models/applicationModel");
const User = require("../models/userModel");
const analyticsRoutes = require("../routes/analyticsRoutes");
const { errorHandler } = require("../middleware/errorHandler");
const { installAuthUserMock } = require("./helpers/authUserMock");

installAuthUserMock(User);

const app = express();
app.use(express.json());
app.use("/api/analytics", analyticsRoutes);
app.use(errorHandler);

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
const invalidPayloadToken = jwt.sign({ id: "not-an-object-id" }, process.env.JWT_SECRET);
const originalAggregate = Application.aggregate;

let aggregateCalls = [];
let aggregateResult = [];

const getRecentMonths = (now = new Date()) => {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    return Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(year, month - (5 - index), 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    });
};

beforeEach(() => {
    aggregateCalls = [];
    aggregateResult = [];
    Application.aggregate = async (pipeline) => {
        aggregateCalls.push(pipeline);
        return aggregateResult;
    };
});

after(() => {
    Application.aggregate = originalAggregate;
});

test("requires authentication and a valid ObjectId token payload", async () => {
    const unauthenticated = await request(app).get("/api/analytics/dashboard");
    const invalidPayload = await request(app)
        .get("/api/analytics/dashboard")
        .set("Authorization", `Bearer ${invalidPayloadToken}`);

    assert.equal(unauthenticated.status, 401);
    assert.equal(invalidPayload.status, 401);
    assert.deepEqual(invalidPayload.body, {
        message: "Not authorized, invalid token payload",
    });
    assert.equal(aggregateCalls.length, 0);
});

test("scopes the aggregation to the authenticated user and returns the zero-data contract", async () => {
    aggregateResult = [{ overview: [], pipeline: [], trend: [], recent: [] }];

    const response = await request(app)
        .get("/api/analytics/dashboard")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.overview, {
        totalApplications: 0,
        applicationsThisMonth: 0,
        applicationsThisWeek: 0,
        pendingApplications: 0,
        interviews: 0,
        offers: 0,
        rejections: 0,
    });
    assert.deepEqual(response.body.pipeline, {
        saved: 0,
        applied: 0,
        screening: 0,
        interview: 0,
        offer: 0,
        rejected: 0,
        withdrawn: 0,
    });
    assert.deepEqual(response.body.performance, {
        responseRate: 0,
        interviewRate: 0,
        offerRate: 0,
    });
    assert.deepEqual(
        response.body.trend,
        getRecentMonths().map((month) => ({ month, count: 0 })),
    );
    assert.deepEqual(response.body.recentApplications, []);

    assert.equal(aggregateCalls.length, 1);
    assert.equal(aggregateCalls[0][0].$match.user.toString(), userId);
    assert.deepEqual(
        Object.keys(aggregateCalls[0][1].$facet),
        ["overview", "pipeline", "trend", "recent"],
    );
});

test("calculates dashboard totals, pipeline counts, rates, trend, and recent applications", async () => {
    const months = getRecentMonths();

    aggregateResult = [{
        overview: [{
            totalApplications: 11,
            applicationsThisMonth: 4,
            applicationsThisWeek: 2,
        }],
        pipeline: [
            { _id: "saved", count: 2 },
            { _id: "applied", count: 3 },
            { _id: "screening", count: 1 },
            { _id: "interview", count: 2 },
            { _id: "offer", count: 1 },
            { _id: "rejected", count: 1 },
            { _id: "withdrawn", count: 1 },
            { _id: "unknown-status", count: 99 },
        ],
        trend: [
            { _id: months[0], count: 1 },
            { _id: months[5], count: 5 },
            { _id: "2020-01", count: 50 },
        ],
        recent: [{
            company: "Acme",
            role: "Software Intern",
            status: "interview",
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
        }],
    }];

    const response = await request(app)
        .get("/api/analytics/dashboard")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.overview, {
        totalApplications: 11,
        applicationsThisMonth: 4,
        applicationsThisWeek: 2,
        pendingApplications: 6,
        interviews: 2,
        offers: 1,
        rejections: 1,
    });
    assert.deepEqual(response.body.pipeline, {
        saved: 2,
        applied: 3,
        screening: 1,
        interview: 2,
        offer: 1,
        rejected: 1,
        withdrawn: 1,
    });
    assert.deepEqual(response.body.performance, {
        responseRate: 0.625,
        interviewRate: 0.25,
        offerRate: 0.125,
    });
    assert.deepEqual(response.body.trend, [
        { month: months[0], count: 1 },
        { month: months[1], count: 0 },
        { month: months[2], count: 0 },
        { month: months[3], count: 0 },
        { month: months[4], count: 0 },
        { month: months[5], count: 5 },
    ]);
    assert.equal(response.body.recentApplications.length, 1);
    assert.equal(response.body.recentApplications[0].company, "Acme");
    assert.equal(response.body.recentApplications[0].role, "Software Intern");
    assert.equal(response.body.recentApplications[0].status, "interview");
    assert.equal(
        response.body.recentApplications[0].createdAt,
        "2026-02-01T00:00:00.000Z",
    );
});

test("handles malformed aggregate output defensively", async () => {
    aggregateResult = [{
        overview: [{ totalApplications: -5, applicationsThisMonth: "nope" }],
        pipeline: [{ _id: "offer", count: -2 }, { _id: "interview", count: "3" }],
        trend: [{ _id: 42, count: 1 }, { _id: getRecentMonths()[5], count: "2" }],
        recent: "not-an-array",
    }];

    const response = await request(app)
        .get("/api/analytics/dashboard")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.overview.totalApplications, 0);
    assert.equal(response.body.overview.applicationsThisMonth, 0);
    assert.equal(response.body.pipeline.offer, 0);
    assert.equal(response.body.pipeline.interview, 3);
    assert.equal(response.body.trend[5].count, 2);
    assert.deepEqual(response.body.recentApplications, []);
});

test("returns a generic server error when the aggregation fails", async () => {
    Application.aggregate = async () => {
        throw new Error("database unavailable");
    };

    const response = await request(app)
        .get("/api/analytics/dashboard")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { message: "Server error" });
});
