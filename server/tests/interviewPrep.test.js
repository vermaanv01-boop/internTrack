const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-for-interview-prep";

const InterviewPrepSession = require("../models/interviewPrepSessionModel");
const Resume = require("../models/resumeModel");
const interviewPrepRoutes = require("../routes/interviewPrepRoutes");
const {
    FALLBACK_REASON,
    generateInterviewQuestions,
    registerProvider,
} = require("../services/interviewPrep");

const app = express();
app.use(express.json());
app.use("/api/interview-prep", interviewPrepRoutes);
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({ message: "Server error" });
});

const ownerId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const ownerToken = jwt.sign({ id: ownerId }, process.env.JWT_SECRET);
const otherToken = jwt.sign({ id: otherUserId }, process.env.JWT_SECRET);

const JOB_DESCRIPTION = [
    "We are hiring a Software Engineer with at least 3 years of experience.",
    "Required skills include JavaScript, TypeScript, React, Node.js, MongoDB, REST APIs, Docker, AWS, and Kubernetes.",
    "You will build APIs, data pipelines, and production services with a focus on performance.",
    "A Bachelor's degree in Computer Science is preferred.",
    "Strong communication and problem solving skills are important.",
].join(" ");

const RESUME_TEXT = [
    "Software Engineer with 4 years of experience building web applications.",
    "B.S. in Computer Science.",
    "Skills: JavaScript, React, Node.js, Express.js, MongoDB, REST APIs, Docker, Jest.",
    "Led a project to deploy services on AWS and improved latency with Redis.",
].join(" ");

const CATEGORY_COUNTS = {
    "technical": 2,
    "resume-based": 2,
    "data-structures-and-algorithms": 2,
    "project-deep-dive": 2,
    "behavioral": 2,
    "situational": 2,
    "role-specific": 3,
};

const clone = (value) => JSON.parse(JSON.stringify(value));

let store = [];
let resumeResult = null;
let resumeFindOneCalls = [];
let createCounter = 0;

const makeSession = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    user: ownerId,
    resume: new mongoose.Types.ObjectId(),
    resumeSnapshot: {
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        extractedTextLength: RESUME_TEXT.length,
    },
    jobDescription: JOB_DESCRIPTION,
    jobTitle: "Software Engineer",
    company: "InternTrack",
    difficulty: "mixed",
    questions: [
        {
            questionId: "q-001",
            text: "Explain how you would apply JavaScript in this role.",
            category: "technical",
            difficulty: "beginner",
            whyRelevant: "JavaScript is listed in the job description.",
            keyConcepts: ["JavaScript fundamentals"],
            evaluationCriteria: ["Explains the concept accurately"],
        },
    ],
    categoriesCovered: ["technical"],
    questionCount: 1,
    provider: "local",
    providerType: "local",
    fallbackUsed: false,
    fallbackReason: null,
    disclaimer: "Review these questions before use.",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
});

const matchesFilter = (document, filter) => Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
        return expected.some((nestedFilter) => matchesFilter(document, nestedFilter));
    }

    if (expected instanceof RegExp) {
        return expected.test(String(document[key] || ""));
    }

    return String(document[key]) === String(expected);
});

const originalMethods = {
    create: InterviewPrepSession.create,
    find: InterviewPrepSession.find,
    findOne: InterviewPrepSession.findOne,
    findOneAndDelete: InterviewPrepSession.findOneAndDelete,
    countDocuments: InterviewPrepSession.countDocuments,
};
const originalResumeFindOne = Resume.findOne;

beforeEach(() => {
    store = [];
    resumeResult = null;
    resumeFindOneCalls = [];
    createCounter = 0;

    InterviewPrepSession.create = async (data) => {
        createCounter += 1;
        const now = new Date(`2026-02-01T00:00:0${createCounter}.000Z`);
        const document = {
            _id: new mongoose.Types.ObjectId(),
            ...clone(data),
            createdAt: now,
            updatedAt: now,
        };

        store.push(document);
        return document;
    };

    InterviewPrepSession.find = (filter) => {
        let sortSpec = { createdAt: -1 };
        let skipCount = 0;
        let limitCount;
        const query = {
            sort(spec) {
                sortSpec = spec;
                return query;
            },
            skip(count) {
                skipCount = count;
                return query;
            },
            limit(count) {
                limitCount = count;
                return query;
            },
            then(resolve, reject) {
                try {
                    const direction = sortSpec && sortSpec.createdAt === 1 ? 1 : -1;
                    let results = store
                        .filter((document) => matchesFilter(document, filter))
                        .sort((left, right) => (
                            (left.createdAt.getTime() - right.createdAt.getTime()) * direction
                        ));

                    results = results.slice(
                        skipCount,
                        limitCount === undefined ? undefined : skipCount + limitCount,
                    );
                    resolve(results);
                } catch (error) {
                    reject(error);
                }
            },
        };

        return query;
    };

    InterviewPrepSession.countDocuments = async (filter) => (
        store.filter((document) => matchesFilter(document, filter)).length
    );

    InterviewPrepSession.findOne = async (filter) => (
        store.find((document) => matchesFilter(document, filter)) || null
    );

    InterviewPrepSession.findOneAndDelete = async (filter) => {
        const index = store.findIndex((document) => matchesFilter(document, filter));

        if (index === -1) {
            return null;
        }

        return store.splice(index, 1)[0];
    };

    Resume.findOne = async (filter) => {
        resumeFindOneCalls.push(filter);
        return resumeResult;
    };
});

after(() => {
    InterviewPrepSession.create = originalMethods.create;
    InterviewPrepSession.find = originalMethods.find;
    InterviewPrepSession.findOne = originalMethods.findOne;
    InterviewPrepSession.findOneAndDelete = originalMethods.findOneAndDelete;
    InterviewPrepSession.countDocuments = originalMethods.countDocuments;
    Resume.findOne = originalResumeFindOne;
});

const postGenerate = (payload, options = {}) => {
    const call = request(app).post("/api/interview-prep/generate");

    if (options.authorized !== false) {
        call.set("Authorization", options.token || `Bearer ${ownerToken}`);
    }

    return call.send(payload);
};

const getHistory = (query = "", options = {}) => {
    const call = request(app).get(`/api/interview-prep/history${query}`);

    if (options.authorized !== false) {
        call.set("Authorization", options.token || `Bearer ${ownerToken}`);
    }

    return call;
};

test("generates a deterministic balanced local question set", () => {
    const input = {
        resumeText: RESUME_TEXT,
        jobDescription: JOB_DESCRIPTION,
        jobTitle: "Software Engineer",
        company: "InternTrack",
        difficulty: "mixed",
    };
    const first = generateInterviewQuestions(input);
    const second = generateInterviewQuestions(input);

    assert.deepEqual(first, second);
    assert.equal(first.questions.length, 15);
    assert.equal(first.questionCount, 15);
    assert.equal(first.provider, "local");
    assert.equal(first.providerType, "local");
    assert.equal(first.fallbackUsed, false);
    assert.equal(first.fallbackReason, null);
    assert.equal(first.categoriesCovered.length, 7);
    assert.equal(new Set(first.questions.map((question) => question.id)).size, 15);

    for (const [category, expectedCount] of Object.entries(CATEGORY_COUNTS)) {
        assert.equal(
            first.questions.filter((question) => question.category === category).length,
            expectedCount,
            category,
        );
    }

    for (const difficulty of ["beginner", "intermediate", "advanced"]) {
        assert.ok(first.questions.some((question) => question.difficulty === difficulty));
    }

    for (const question of first.questions) {
        assert.ok(question.id);
        assert.ok(question.text);
        assert.ok(question.category);
        assert.ok(question.difficulty);
        assert.ok(question.whyRelevant);
        assert.ok(Array.isArray(question.keyConcepts));
        assert.ok(question.keyConcepts.length > 0);
        assert.ok(Array.isArray(question.evaluationCriteria));
        assert.ok(question.evaluationCriteria.length > 0);
    }
});

test("applies a specific difficulty to every generated question", () => {
    const result = generateInterviewQuestions({
        resumeText: RESUME_TEXT,
        jobDescription: JOB_DESCRIPTION,
        jobTitle: "Software Engineer",
        difficulty: "advanced",
    });

    assert.ok(result.questions.every((question) => question.difficulty === "advanced"));
});

test("falls back to the local provider when a provider fails", () => {
    registerProvider("broken-interview-prep-provider", {
        type: "external",
        generate() {
            throw new Error("provider unavailable");
        },
    });

    const result = generateInterviewQuestions({
        resumeText: RESUME_TEXT,
        jobDescription: JOB_DESCRIPTION,
        difficulty: "mixed",
    }, {
        provider: "broken-interview-prep-provider",
    });

    assert.equal(result.questions.length, 15);
    assert.equal(result.provider, "local");
    assert.equal(result.providerType, "local");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackReason, FALLBACK_REASON);
});

test("falls back to the local provider when the requested provider is unknown", () => {
    const result = generateInterviewQuestions({
        resumeText: RESUME_TEXT,
        jobDescription: JOB_DESCRIPTION,
    }, {
        provider: "not-registered",
    });

    assert.equal(result.provider, "local");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackReason, FALLBACK_REASON);
});

test("requires authentication for all interview preparation endpoints", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const responses = await Promise.all([
        postGenerate({}, { authorized: false }),
        getHistory("", { authorized: false }),
        request(app).get(`/api/interview-prep/history/${id}`),
        request(app).delete(`/api/interview-prep/history/${id}`),
    ]);

    for (const response of responses) {
        assert.equal(response.status, 401);
    }
});

test("validates the generation request before querying resumes", async () => {
    const resumeId = new mongoose.Types.ObjectId().toString();
    const cases = [
        postGenerate({ jobDescription: JOB_DESCRIPTION }),
        postGenerate({ resumeId: "not-an-object-id", jobDescription: JOB_DESCRIPTION }),
        postGenerate({ resumeId, jobDescription: "Too short" }),
        postGenerate({ resumeId, jobDescription: "a".repeat(30001) }),
        postGenerate({ resumeId, jobDescription: JOB_DESCRIPTION, difficulty: "expert" }),
        postGenerate({ resumeId, jobDescription: JOB_DESCRIPTION, jobTitle: 42 }),
        postGenerate({ resumeId, jobDescription: JOB_DESCRIPTION, company: {} }),
    ];
    const responses = await Promise.all(cases);

    for (const response of responses) {
        assert.equal(response.status, 400);
        assert.equal(response.body.message, "Validation failed");
        assert.ok(response.body.errors);
    }

    assert.equal(resumeFindOneCalls.length, 0);
    assert.equal(store.length, 0);
});

test("loads only the authenticated user's resume and rejects missing text", async () => {
    const resumeId = new mongoose.Types.ObjectId().toString();

    resumeResult = null;
    const missing = await postGenerate({ resumeId, jobDescription: JOB_DESCRIPTION });

    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, "Resume not found");
    assert.deepEqual(resumeFindOneCalls[0], { _id: resumeId, user: ownerId });

    resumeResult = { _id: resumeId, extractedText: " " };
    const empty = await postGenerate({ resumeId, jobDescription: JOB_DESCRIPTION });

    assert.equal(empty.status, 400);
    assert.match(empty.body.message, /usable extracted text/);
    assert.equal(store.length, 0);
});

test("generates and persists a complete session snapshot", async () => {
    const resumeId = new mongoose.Types.ObjectId().toString();
    const resume = {
        _id: resumeId,
        extractedText: RESUME_TEXT,
        originalName: "candidate-resume.pdf",
        mimeType: "application/pdf",
        fileSize: 2048,
        storedFilename: "private-resume.pdf",
    };
    resumeResult = resume;

    const response = await postGenerate({
        resumeId,
        jobDescription: JOB_DESCRIPTION,
        jobTitle: "  Software Engineer  ",
        company: "  InternTrack  ",
        difficulty: "MIXED",
        resumeText: "IGNORE THIS CLIENT RESUME TEXT",
    });

    assert.equal(response.status, 201);
    assert.equal(store.length, 1);
    assert.deepEqual(resumeFindOneCalls[0], { _id: resumeId, user: ownerId });

    const session = response.body.session;
    const saved = store[0];

    assert.ok(session.id);
    assert.equal(session.resumeId, resumeId);
    assert.equal(session.jobTitle, "Software Engineer");
    assert.equal(session.company, "InternTrack");
    assert.equal(session.difficulty, "mixed");
    assert.equal(session.requestedDifficulty, "mixed");
    assert.equal(session.questionCount, 15);
    assert.equal(session.questions.length, 15);
    assert.equal(session.categoriesCovered.length, 7);
    assert.equal(session.provider, "local");
    assert.equal(session.providerType, "local");
    assert.equal(session.fallbackUsed, false);
    assert.equal(session.fallbackReason, null);
    assert.ok(session.disclaimer);
    assert.equal(Object.hasOwn(session, "extractedText"), false);
    assert.equal(Object.hasOwn(session, "storedFilename"), false);
    assert.equal(session.resumeSnapshot.originalName, "candidate-resume.pdf");
    assert.equal(session.resumeSnapshot.extractedTextLength, RESUME_TEXT.length);
    assert.deepEqual(session.resumeSnapshot, saved.resumeSnapshot);

    for (const question of session.questions) {
        assert.ok(question.id);
        assert.equal(question.id, question.questionId);
        assert.ok(question.text);
        assert.equal(question.text, question.question);
        assert.ok(question.whyRelevant);
        assert.equal(question.whyRelevant, question.relevance);
        assert.ok(Array.isArray(question.keyConcepts));
        assert.ok(Array.isArray(question.evaluationCriteria));
    }

    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes("IGNORE THIS CLIENT RESUME TEXT"), false);
    assert.equal(serialized.includes("private-resume.pdf"), false);
    assert.equal(saved.user, ownerId);
    assert.equal(saved.resume, resumeId);
    assert.equal(saved.questionCount, 15);
    assert.equal(saved.provider, "local");
    assert.equal(saved.providerType, "local");
    assert.equal(saved.fallbackUsed, false);
    assert.equal(saved.jobDescription, JOB_DESCRIPTION);
    assert.equal(saved.questions.length, 15);
    assert.equal(saved.questions[0].questionId, "q-001");
});

test("keeps the original session snapshot unchanged after the resume changes", async () => {
    const resumeId = new mongoose.Types.ObjectId().toString();
    resumeResult = {
        _id: resumeId,
        extractedText: RESUME_TEXT,
        originalName: "first.pdf",
    };

    const first = await postGenerate({
        resumeId,
        jobDescription: JOB_DESCRIPTION,
        jobTitle: "Software Engineer",
    });

    assert.equal(first.status, 201);
    const savedSnapshot = clone(store[0]);

    resumeResult = {
        _id: resumeId,
        extractedText: "Entry-level applicant with no technical skills or project experience.",
        originalName: "replacement.pdf",
    };

    const second = await postGenerate({
        resumeId,
        jobDescription: JOB_DESCRIPTION,
        jobTitle: "Software Engineer",
    });

    assert.equal(second.status, 201);
    assert.equal(store.length, 2);
    assert.deepEqual(clone(store[0]), savedSnapshot);
    assert.notEqual(second.body.session.id, first.body.session.id);

    const detail = await getHistory(`/${first.body.session.id}`);

    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.session.questions, first.body.session.questions);
    assert.deepEqual(detail.body.session.resumeSnapshot, first.body.session.resumeSnapshot);
    assert.equal(detail.body.session.jobDescription, JOB_DESCRIPTION);
});

test("lists paginated session summaries without job descriptions", async () => {
    store.push(
        makeSession({ jobTitle: "First" }),
        makeSession({
            jobTitle: "Second",
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        makeSession({
            jobTitle: "Third",
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
        makeSession({ user: otherUserId, jobTitle: "Other" }),
    );

    const pageOne = await getHistory("?page=1&limit=2");
    const pageTwo = await getHistory("?page=2&limit=2");

    assert.equal(pageOne.status, 200);
    assert.equal(pageOne.body.sessions.length, 2);
    assert.deepEqual(pageOne.body.pagination, {
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
    });
    assert.equal(pageTwo.status, 200);
    assert.equal(pageTwo.body.sessions.length, 1);
    assert.equal(pageOne.body.sessions[0].jobTitle, "Third");
    assert.equal(pageTwo.body.sessions[0].jobTitle, "First");
    assert.equal(Object.hasOwn(pageOne.body.sessions[0], "jobDescription"), false);
    assert.equal(Object.hasOwn(pageOne.body.sessions[0], "questions"), false);
});

test("searches, filters by difficulty, and sorts session history", async () => {
    store.push(
        makeSession({
            jobTitle: "Frontend Engineer",
            company: "Acme",
            difficulty: "advanced",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        makeSession({
            jobTitle: "Backend Engineer",
            company: "Globex",
            difficulty: "beginner",
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        makeSession({
            jobTitle: "Designer",
            company: "Acme",
            difficulty: "mixed",
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
    );

    const companySearch = await getHistory("?search=ACME");
    const titleSearch = await getHistory("?search=backend");
    const advanced = await getHistory("?difficulty=advanced");
    const oldestFirst = await getHistory("?sort=oldest");

    assert.equal(companySearch.status, 200);
    assert.equal(companySearch.body.sessions.length, 2);
    assert.ok(companySearch.body.sessions.every((session) => session.company === "Acme"));
    assert.equal(titleSearch.body.sessions.length, 1);
    assert.equal(titleSearch.body.sessions[0].jobTitle, "Backend Engineer");
    assert.equal(advanced.body.sessions.length, 1);
    assert.equal(advanced.body.sessions[0].difficulty, "advanced");
    assert.equal(oldestFirst.body.sessions[0].jobTitle, "Frontend Engineer");
});

test("validates history query parameters", async () => {
    const cases = [
        "?page=0",
        "?page=abc",
        "?limit=0",
        "?limit=101",
        "?difficulty=expert",
        "?sort=random",
    ];

    for (const query of cases) {
        const response = await getHistory(query);

        assert.equal(response.status, 400, query);
        assert.equal(response.body.message, "Validation failed", query);
        assert.ok(response.body.errors, query);
    }
});

test("gets the full session detail only for the owner", async () => {
    const ownSession = makeSession();
    const otherSession = makeSession({ user: otherUserId });
    store.push(ownSession, otherSession);

    const invalid = await getHistory("/not-an-object-id");
    const missing = await getHistory(`/${new mongoose.Types.ObjectId()}`);
    const own = await getHistory(`/${ownSession._id}`);
    const crossUser = await getHistory(`/${otherSession._id}`);
    const otherUsersOwn = await getHistory(`/${otherSession._id}`, {
        token: `Bearer ${otherToken}`,
    });

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.message, "Invalid session ID");
    assert.equal(missing.status, 404);
    assert.equal(own.status, 200);
    assert.equal(own.body.session._id, String(ownSession._id));
    assert.equal(own.body.session.jobDescription, JOB_DESCRIPTION);
    assert.deepEqual(own.body.session.questions[0].keyConcepts, ["JavaScript fundamentals"]);
    assert.equal(crossUser.status, 404);
    assert.equal(crossUser.body.message, "Interview preparation session not found");
    assert.equal(otherUsersOwn.status, 200);
    assert.equal(otherUsersOwn.body.session._id, String(otherSession._id));
});

test("deletes only the owner's session", async () => {
    const ownSession = makeSession();
    const otherSession = makeSession({ user: otherUserId });
    store.push(ownSession, otherSession);

    const invalid = await request(app)
        .delete("/api/interview-prep/history/not-an-object-id")
        .set("Authorization", `Bearer ${ownerToken}`);
    const crossUser = await request(app)
        .delete(`/api/interview-prep/history/${otherSession._id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    const deleted = await request(app)
        .delete(`/api/interview-prep/history/${ownSession._id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    const detailAfterDelete = await getHistory(`/${ownSession._id}`);

    assert.equal(invalid.status, 400);
    assert.equal(crossUser.status, 404);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.message, "Interview preparation session deleted successfully");
    assert.equal(detailAfterDelete.status, 404);
    assert.equal(store.length, 1);
    assert.equal(String(store[0]._id), String(otherSession._id));
});

test("does not persist failed generations", async () => {
    const resumeId = new mongoose.Types.ObjectId().toString();
    resumeResult = { _id: resumeId, extractedText: " " };

    const response = await postGenerate({
        resumeId,
        jobDescription: JOB_DESCRIPTION,
    });

    assert.equal(response.status, 400);
    assert.equal(store.length, 0);
});
