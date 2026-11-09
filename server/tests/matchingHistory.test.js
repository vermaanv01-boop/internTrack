const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-for-matching-history";

const MatchingAnalysis = require("../models/matchingAnalysisModel");
const Resume = require("../models/resumeModel");
const matchingRoutes = require("../routes/matchingRoutes");

const app = express();
app.use(express.json());
app.use("/api/matching", matchingRoutes);
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
    "Required skills include JavaScript, TypeScript, React, Node.js, MongoDB, REST APIs, Docker, AWS, and Jest.",
    "A Bachelor's degree in Computer Science is required.",
    "Strong problem solving and communication skills are important.",
].join(" ");

const RESUME_TEXT = [
    "Software Engineer with 4 years of experience building web applications.",
    "B.S. in Computer Science.",
    "Skills: JavaScript, React, Node.js, Express.js, MongoDB, REST APIs, Docker, Jest.",
    "I use problem solving and communication daily.",
].join(" ");

const clone = (value) => JSON.parse(JSON.stringify(value));

let store = [];
let resumeResult = null;
let createCounter = 0;

const makeAnalysis = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    user: ownerId,
    resume: new mongoose.Types.ObjectId(),
    jobDescription: JOB_DESCRIPTION,
    jobTitle: "Software Engineer",
    company: "InternTrack",
    matchScore: 82,
    scoreLabel: "Good Match",
    matchedSkills: [{ name: "React", category: "Frontend" }],
    missingSkills: [{ name: "AWS", category: "Cloud/DevOps" }],
    partialMatches: [{ jobSkill: "TypeScript", resumeSkill: "JavaScript" }],
    experienceAlignment: { score: 100, requiredYears: 3, candidateYears: 4 },
    educationAlignment: { score: 100, requiredLevel: "bachelor" },
    matchedKeywords: [{ keyword: "communication", jobMentions: 1, resumeMentions: 1 }],
    missingKeywords: [{ keyword: "aws", jobMentions: 1, resumeMentions: 0 }],
    totalKeywords: 2,
    keywordCoverage: 50,
    strengths: ["Matches React."],
    improvements: ["Add AWS evidence."],
    scoreBreakdown: { skills: { score: 82, weight: 55 } },
    summary: "The resume is a Good Match.",
    provider: "local",
    disclaimer: "Deterministic local analysis.",
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

    if (expected && typeof expected === "object" && !(expected instanceof mongoose.Types.ObjectId)) {
        const operators = Object.keys(expected);

        if (operators.some((operator) => operator.startsWith("$"))) {
            if (expected.$gte !== undefined && Number(document[key]) < expected.$gte) {
                return false;
            }

            if (expected.$lte !== undefined && Number(document[key]) > expected.$lte) {
                return false;
            }

            return true;
        }
    }

    return String(document[key]) === String(expected);
});

const originalMethods = {
    create: MatchingAnalysis.create,
    find: MatchingAnalysis.find,
    findOne: MatchingAnalysis.findOne,
    findOneAndDelete: MatchingAnalysis.findOneAndDelete,
    countDocuments: MatchingAnalysis.countDocuments,
};
const originalResumeFindOne = Resume.findOne;

beforeEach(() => {
    store = [];
    resumeResult = null;
    createCounter = 0;

    MatchingAnalysis.create = async (data) => {
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

    MatchingAnalysis.find = (filter) => {
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

    MatchingAnalysis.countDocuments = async (filter) => (
        store.filter((document) => matchesFilter(document, filter)).length
    );

    MatchingAnalysis.findOne = async (filter) => (
        store.find((document) => matchesFilter(document, filter)) || null
    );

    MatchingAnalysis.findOneAndDelete = async (filter) => {
        const index = store.findIndex((document) => matchesFilter(document, filter));

        if (index === -1) {
            return null;
        }

        return store.splice(index, 1)[0];
    };

    Resume.findOne = async () => resumeResult;
});

after(() => {
    MatchingAnalysis.create = originalMethods.create;
    MatchingAnalysis.find = originalMethods.find;
    MatchingAnalysis.findOne = originalMethods.findOne;
    MatchingAnalysis.findOneAndDelete = originalMethods.findOneAndDelete;
    MatchingAnalysis.countDocuments = originalMethods.countDocuments;
    Resume.findOne = originalResumeFindOne;
});

const getHistory = (query = "", options = {}) => {
    const call = request(app).get(`/api/matching/history${query}`);

    if (options.authorized !== false) {
        call.set("Authorization", options.token || `Bearer ${ownerToken}`);
    }

    return call;
};

test("requires authentication for all history endpoints", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const responses = await Promise.all([
        getHistory("", { authorized: false }),
        request(app).get(`/api/matching/history/${id}`),
        request(app).delete(`/api/matching/history/${id}`),
    ]);

    for (const response of responses) {
        assert.equal(response.status, 401);
    }
});

test("lists paginated summaries without job descriptions", async () => {
    const first = makeAnalysis({ jobTitle: "First" });
    const second = makeAnalysis({
        jobTitle: "Second",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    const third = makeAnalysis({
        jobTitle: "Third",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    const other = makeAnalysis({ user: otherUserId, jobTitle: "Other" });
    store.push(first, second, third, other);

    const pageOne = await getHistory("?page=1&limit=2");
    const pageTwo = await getHistory("?page=2&limit=2");

    assert.equal(pageOne.status, 200);
    assert.equal(pageOne.body.analyses.length, 2);
    assert.deepEqual(pageOne.body.pagination, {
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
    });
    assert.equal(pageTwo.status, 200);
    assert.equal(pageTwo.body.analyses.length, 1);
    assert.equal(pageOne.body.analyses[0].jobTitle, "Third");
    assert.equal(pageTwo.body.analyses[0].jobTitle, "First");
    assert.equal(Object.hasOwn(pageOne.body.analyses[0], "jobDescription"), false);
    assert.equal(pageOne.body.analyses[0].matchedSkillsCount, 1);
    assert.equal(pageOne.body.analyses[0].missingSkillsCount, 1);
    assert.equal(pageOne.body.analyses[0].partialMatchesCount, 1);
    assert.equal(pageOne.body.analyses[0].missingKeywordsCount, 1);
});

test("searches job title and company and applies score filters", async () => {
    store.push(
        makeAnalysis({ jobTitle: "Frontend Engineer", company: "Acme", matchScore: 90 }),
        makeAnalysis({ jobTitle: "Backend Engineer", company: "Globex", matchScore: 75 }),
        makeAnalysis({ jobTitle: "Designer", company: "Acme", matchScore: 55 }),
    );

    const companySearch = await getHistory("?search=ACME");
    const titleSearch = await getHistory("?search=backend");
    const scoreRange = await getHistory("?minScore=70&maxScore=80");
    const combined = await getHistory("?search=engineer&minScore=85");

    assert.equal(companySearch.status, 200);
    assert.equal(companySearch.body.analyses.length, 2);
    assert.ok(companySearch.body.analyses.every((analysis) => analysis.company === "Acme"));
    assert.equal(titleSearch.body.analyses.length, 1);
    assert.equal(titleSearch.body.analyses[0].jobTitle, "Backend Engineer");
    assert.equal(scoreRange.body.analyses.length, 1);
    assert.equal(scoreRange.body.analyses[0].matchScore, 75);
    assert.equal(combined.body.analyses.length, 1);
    assert.equal(combined.body.analyses[0].matchScore, 90);
});

test("sorts history newest and oldest", async () => {
    const oldest = makeAnalysis({
        jobTitle: "Oldest",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newest = makeAnalysis({
        jobTitle: "Newest",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    store.push(oldest, newest);

    const defaultSort = await getHistory();
    const oldestFirst = await getHistory("?sort=oldest");

    assert.equal(defaultSort.body.analyses[0].jobTitle, "Newest");
    assert.equal(oldestFirst.body.analyses[0].jobTitle, "Oldest");
});

test("validates history query parameters", async () => {
    const cases = [
        "?page=0",
        "?page=abc",
        "?limit=0",
        "?limit=101",
        "?minScore=abc",
        "?minScore=-1",
        "?maxScore=101",
        "?minScore=90&maxScore=10",
        "?sort=random",
    ];

    for (const query of cases) {
        const response = await getHistory(query);

        assert.equal(response.status, 400, query);
        assert.equal(response.body.message, "Validation failed", query);
        assert.ok(response.body.errors, query);
    }
});

test("gets the full analysis detail for the owner", async () => {
    const analysis = makeAnalysis();
    store.push(analysis);

    const response = await getHistory(`/${analysis._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.analysis._id, String(analysis._id));
    assert.equal(response.body.analysis.jobDescription, JOB_DESCRIPTION);
    assert.equal(response.body.analysis.matchScore, 82);
    assert.equal(response.body.analysis.scoreLabel, "Good Match");
    assert.equal(response.body.analysis.matchLabel, "Good Match");
    assert.deepEqual(response.body.analysis.partialMatches, analysis.partialMatches);
    assert.deepEqual(response.body.analysis.relatedSkills, analysis.partialMatches);
    assert.deepEqual(response.body.analysis.experienceAlignment, analysis.experienceAlignment);
    assert.deepEqual(response.body.analysis.experienceAnalysis, analysis.experienceAlignment);
    assert.deepEqual(response.body.analysis.educationAlignment, analysis.educationAlignment);
    assert.deepEqual(response.body.analysis.keywordAnalysis.missingKeywords, analysis.missingKeywords);
    assert.equal(response.body.analysis.keywordAnalysis.totalKeywords, 2);
    assert.equal(response.body.analysis.keywordAnalysis.coverage, 50);
    assert.equal(Object.hasOwn(response.body.analysis, "__v"), false);
});

test("rejects invalid and cross-user analysis detail requests", async () => {
    const ownAnalysis = makeAnalysis();
    const otherAnalysis = makeAnalysis({ user: otherUserId });
    store.push(ownAnalysis, otherAnalysis);

    const invalid = await getHistory("/not-an-object-id");
    const missing = await getHistory(`/${new mongoose.Types.ObjectId()}`);
    const crossUser = await getHistory(`/${otherAnalysis._id}`, {
        token: `Bearer ${otherToken}`,
    });
    const wrongOwner = await getHistory(`/${otherAnalysis._id}`);

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.message, "Invalid analysis ID");
    assert.equal(missing.status, 404);
    assert.equal(crossUser.status, 200);
    assert.equal(crossUser.body.analysis._id, String(otherAnalysis._id));
    assert.equal(wrongOwner.status, 404);
    assert.equal(wrongOwner.body.message, "Analysis not found");
});

test("deletes only the owner's analysis", async () => {
    const ownAnalysis = makeAnalysis();
    const otherAnalysis = makeAnalysis({ user: otherUserId });
    store.push(ownAnalysis, otherAnalysis);

    const invalid = await request(app)
        .delete("/api/matching/history/not-an-object-id")
        .set("Authorization", `Bearer ${ownerToken}`);
    const crossUser = await request(app)
        .delete(`/api/matching/history/${otherAnalysis._id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    const deleted = await request(app)
        .delete(`/api/matching/history/${ownAnalysis._id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    const detailAfterDelete = await getHistory(`/${ownAnalysis._id}`);

    assert.equal(invalid.status, 400);
    assert.equal(crossUser.status, 404);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.message, "Matching analysis deleted successfully");
    assert.equal(detailAfterDelete.status, 404);
    assert.equal(store.length, 1);
    assert.equal(String(store[0]._id), String(otherAnalysis._id));
});

test("persists an immutable snapshot when the resume changes later", async () => {
    const resumeId = new mongoose.Types.ObjectId();
    resumeResult = { _id: resumeId, extractedText: RESUME_TEXT };

    const firstAnalysis = await request(app)
        .post("/api/matching/analyze")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ jobDescription: JOB_DESCRIPTION, resumeId: String(resumeId) });

    assert.equal(firstAnalysis.status, 200);
    assert.ok(firstAnalysis.body.analysisId);
    assert.equal(store.length, 1);

    const savedSnapshot = clone(store[0]);
    resumeResult = {
        _id: resumeId,
        extractedText: "Internship applicant with no listed technical skills or professional experience.",
    };

    const secondAnalysis = await request(app)
        .post("/api/matching/analyze")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ jobDescription: JOB_DESCRIPTION, resumeId: String(resumeId) });

    assert.equal(secondAnalysis.status, 200);
    assert.equal(store.length, 2);
    assert.deepEqual(clone(store[0]), savedSnapshot);
    assert.notEqual(secondAnalysis.body.analysisId, firstAnalysis.body.analysisId);

    const detail = await getHistory(`/${firstAnalysis.body.analysisId}`);

    assert.equal(detail.status, 200);
    assert.equal(detail.body.analysis.matchScore, firstAnalysis.body.matchScore);
    assert.deepEqual(detail.body.analysis.matchedSkills, firstAnalysis.body.matchedSkills);
    assert.deepEqual(detail.body.analysis.missingSkills, firstAnalysis.body.missingSkills);
    assert.equal(detail.body.analysis.jobDescription, JOB_DESCRIPTION);
});

test("does not persist failed analyses", async () => {
    resumeResult = {
        _id: new mongoose.Types.ObjectId(),
        extractedText: RESUME_TEXT,
    };

    const response = await request(app)
        .post("/api/matching/analyze")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ jobDescription: "Too short" });

    assert.equal(response.status, 400);
    assert.equal(store.length, 0);
});
