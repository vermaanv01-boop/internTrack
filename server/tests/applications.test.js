const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-for-application-tests";

const Application = require("../models/applicationModel");
const User = require("../models/userModel");
const applicationRoutes = require("../routes/applicationRoutes");
const { errorHandler } = require("../middleware/errorHandler");
const { installAuthUserMock } = require("./helpers/authUserMock");

installAuthUserMock(User);

const app = express();
app.use(express.json());
app.use("/api/applications", applicationRoutes);
app.use(errorHandler);

const ownerId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const ownerToken = jwt.sign({ id: ownerId }, process.env.JWT_SECRET);
const otherToken = jwt.sign({ id: otherUserId }, process.env.JWT_SECRET);

const originalMethods = {
    find: Application.find,
    findOne: Application.findOne,
    create: Application.create,
    findOneAndUpdate: Application.findOneAndUpdate,
    findOneAndDelete: Application.findOneAndDelete,
    countDocuments: Application.countDocuments,
};

let store = [];
let findCalls = [];
let countCalls = [];
let createCalls = [];
let updateCalls = [];
let deleteCalls = [];

const matchesFilter = (document, filter) => Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
        return expected.some((nestedFilter) => matchesFilter(document, nestedFilter));
    }

    if (expected instanceof RegExp) {
        return expected.test(String(document[key] || ""));
    }

    return String(document[key]) === String(expected);
});

const makeApplication = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    user: ownerId,
    company: "Acme",
    role: "Software Engineering Intern",
    status: "saved",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
});

const installMockModel = () => {
    Application.find = (filter) => {
        findCalls.push(filter);

        const query = {
            sort(spec) {
                query.sortSpec = spec;
                return query;
            },
            skip(count) {
                query.skipCount = count;
                return query;
            },
            limit(count) {
                const direction = query.sortSpec && query.sortSpec.createdAt === 1 ? 1 : -1;
                const results = store
                    .filter((document) => matchesFilter(document, filter))
                    .sort((left, right) => (
                        (left.createdAt.getTime() - right.createdAt.getTime()) * direction
                    ))
                    .slice(query.skipCount || 0, (query.skipCount || 0) + count);

                return Promise.resolve(results);
            },
        };

        return query;
    };

    Application.countDocuments = async (filter) => {
        countCalls.push(filter);
        return store.filter((document) => matchesFilter(document, filter)).length;
    };

    Application.findOne = async (filter) => (
        store.find((document) => matchesFilter(document, filter)) || null
    );

    Application.create = async (data) => {
        createCalls.push(data);
        const now = new Date();
        const document = {
            _id: new mongoose.Types.ObjectId(),
            status: "saved",
            ...data,
            createdAt: now,
            updatedAt: now,
        };

        store.push(document);
        return document;
    };

    Application.findOneAndUpdate = async (filter, update, options) => {
        updateCalls.push({ filter, update, options });
        const document = store.find((candidate) => matchesFilter(candidate, filter));

        if (!document) {
            return null;
        }

        Object.assign(document, update, { updatedAt: new Date() });
        return document;
    };

    Application.findOneAndDelete = async (filter) => {
        deleteCalls.push(filter);
        const index = store.findIndex((document) => matchesFilter(document, filter));

        if (index === -1) {
            return null;
        }

        return store.splice(index, 1)[0];
    };
};

beforeEach(() => {
    store = [];
    findCalls = [];
    countCalls = [];
    createCalls = [];
    updateCalls = [];
    deleteCalls = [];
    installMockModel();
});

after(() => {
    Application.find = originalMethods.find;
    Application.findOne = originalMethods.findOne;
    Application.create = originalMethods.create;
    Application.findOneAndUpdate = originalMethods.findOneAndUpdate;
    Application.findOneAndDelete = originalMethods.findOneAndDelete;
    Application.countDocuments = originalMethods.countDocuments;
});

const asUser = (requestBuilder, token = ownerToken) => (
    requestBuilder.set("Authorization", `Bearer ${token}`)
);

test("requires authentication for every application endpoint", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const responses = await Promise.all([
        request(app).post("/api/applications").send({ company: "Acme", role: "Intern" }),
        request(app).get("/api/applications"),
        request(app).get(`/api/applications/${id}`),
        request(app).put(`/api/applications/${id}`).send({ status: "offer" }),
        request(app).delete(`/api/applications/${id}`),
    ]);

    for (const response of responses) {
        assert.equal(response.status, 401);
    }

    assert.equal(createCalls.length, 0);
    assert.equal(findCalls.length, 0);
    assert.equal(updateCalls.length, 0);
    assert.equal(deleteCalls.length, 0);
});

test("creates an application for the authenticated user and ignores client ownership fields", async () => {
    const response = await asUser(request(app)
        .post("/api/applications")
        .send({
            company: "  Google  ",
            role: "  Software Engineering Intern  ",
            status: "applied",
            location: "Mountain View, CA",
            jobUrl: "https://careers.google.com/jobs/123",
            user: otherUserId,
            _id: otherUserId,
        }));

    assert.equal(response.status, 201);
    assert.equal(response.body.message, "Application created successfully");
    assert.equal(response.body.application.company, "Google");
    assert.equal(response.body.application.role, "Software Engineering Intern");
    assert.equal(response.body.application.status, "applied");
    assert.equal(response.body.application.user, ownerId);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].user, ownerId);
    assert.equal(createCalls[0]._id, undefined);
});

test("applies the saved status default and accepts null optional fields", async () => {
    const response = await asUser(request(app)
        .post("/api/applications")
        .send({
            company: "Acme",
            role: "Intern",
            location: null,
            salary: null,
            notes: null,
            description: null,
            jobUrl: null,
            appliedAt: null,
            deadline: null,
        }));

    assert.equal(response.status, 201);
    assert.equal(response.body.application.status, "saved");
    assert.equal(createCalls[0].status, undefined);
});

test("rejects missing required fields and invalid enum, URL, and date values", async () => {
    const missing = await asUser(request(app).post("/api/applications").send({}));

    assert.equal(missing.status, 400);
    assert.equal(missing.body.message, "Validation failed");
    assert.equal(missing.body.errors.company, "Company is required");
    assert.equal(missing.body.errors.role, "Role is required");

    const invalid = await asUser(request(app)
        .post("/api/applications")
        .send({
            company: "Acme",
            role: "Intern",
            status: "pending",
            employmentType: "freelance",
            jobUrl: "ftp://example.com/job",
            appliedAt: "not-a-date",
            deadline: "also-not-a-date",
        }));

    assert.equal(invalid.status, 400);
    assert.ok(invalid.body.errors.status);
    assert.ok(invalid.body.errors.employmentType);
    assert.ok(invalid.body.errors.jobUrl);
    assert.ok(invalid.body.errors.appliedAt);
    assert.ok(invalid.body.errors.deadline);
    assert.equal(createCalls.length, 0);
});

test("validates list pagination, filters, and sorting", async () => {
    const cases = [
        "?page=0",
        "?page=abc",
        "?limit=0",
        "?limit=101",
        "?status=pending",
        "?sort=random",
    ];

    for (const query of cases) {
        const response = await asUser(request(app).get(`/api/applications${query}`));

        assert.equal(response.status, 400, query);
        assert.equal(response.body.message, "Validation failed", query);
        assert.ok(response.body.errors, query);
    }

    assert.equal(findCalls.length, 0);
});

test("lists only the owner's applications with filters, pagination, and sort", async () => {
    store.push(
        makeApplication({
            company: "Google",
            role: "Frontend Intern",
            status: "applied",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        makeApplication({
            company: "Google",
            role: "Backend Intern",
            status: "applied",
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        makeApplication({
            company: "Google",
            role: "Platform Intern",
            status: "interview",
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
        makeApplication({
            user: otherUserId,
            company: "Google",
            role: "Other User Intern",
            status: "applied",
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
        }),
    );

    const firstPage = await asUser(request(app).get(
        "/api/applications?status=applied&search=google&sort=oldest&page=1&limit=1",
    ));
    const secondPage = await asUser(request(app).get(
        "/api/applications?status=applied&search=google&sort=oldest&page=2&limit=1",
    ));

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.applications.length, 1);
    assert.equal(firstPage.body.applications[0].role, "Frontend Intern");
    assert.deepEqual(firstPage.body.pagination, {
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
    });
    assert.equal(secondPage.body.applications[0].role, "Backend Intern");

    const defaultList = await asUser(request(app).get("/api/applications"));

    assert.equal(defaultList.status, 200);
    assert.equal(defaultList.body.applications.length, 3);
    assert.equal(defaultList.body.applications[0].role, "Platform Intern");
    assert.deepEqual(defaultList.body.pagination, {
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
    });
    assert.equal(findCalls[0].user, ownerId);
    assert.equal(countCalls[0].user, ownerId);
});

test("gets a single application only for its owner", async () => {
    const application = makeApplication();
    store.push(application);

    const own = await asUser(request(app).get(`/api/applications/${application._id}`));
    const crossUser = await asUser(
        request(app).get(`/api/applications/${application._id}`),
        otherToken,
    );
    const invalid = await asUser(request(app).get("/api/applications/not-an-id"));

    assert.equal(own.status, 200);
    assert.equal(own.body.application._id, String(application._id));
    assert.equal(crossUser.status, 404);
    assert.deepEqual(crossUser.body, { message: "Application not found" });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, { message: "Invalid application ID" });
});

test("updates an application without allowing ownership changes", async () => {
    const application = makeApplication();
    store.push(application);

    const response = await asUser(request(app)
        .put(`/api/applications/${application._id}`)
        .send({ status: "offer", user: otherUserId }));

    assert.equal(response.status, 200);
    assert.equal(response.body.application.status, "offer");
    assert.equal(response.body.application.user, ownerId);
    assert.deepEqual(updateCalls[0].update, { status: "offer" });
    assert.equal(updateCalls[0].options.new, true);
    assert.equal(updateCalls[0].options.runValidators, true);

    const crossUser = await asUser(
        request(app)
            .put(`/api/applications/${application._id}`)
            .send({ status: "rejected" }),
        otherToken,
    );

    assert.equal(crossUser.status, 404);
    assert.equal(store[0].status, "offer");
});

test("rejects empty updates and invalid application IDs", async () => {
    const application = makeApplication();
    store.push(application);

    const empty = await asUser(request(app)
        .put(`/api/applications/${application._id}`)
        .send({}));
    const invalid = await asUser(request(app)
        .put("/api/applications/not-an-id")
        .send({ status: "offer" }));

    assert.equal(empty.status, 400);
    assert.equal(empty.body.message, "Validation failed");
    assert.equal(empty.body.errors.body, "Provide at least one valid field to update");
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, { message: "Invalid application ID" });
    assert.equal(updateCalls.length, 0);
});

test("deletes only the owner's application", async () => {
    const application = makeApplication();
    store.push(application);

    const crossUser = await asUser(
        request(app).delete(`/api/applications/${application._id}`),
        otherToken,
    );

    assert.equal(crossUser.status, 404);
    assert.equal(store.length, 1);

    const deleted = await asUser(request(app).delete(`/api/applications/${application._id}`));

    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { message: "Application deleted successfully" });
    assert.equal(store.length, 0);

    const secondDelete = await asUser(
        request(app).delete(`/api/applications/${application._id}`),
    );

    assert.equal(secondDelete.status, 404);
    assert.equal(deleteCalls[0].user, otherUserId);
    assert.equal(deleteCalls[1].user, ownerId);
});
