const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-for-matching-tests";

const Resume = require("../models/resumeModel");
const matchingRoutes = require("../routes/matchingRoutes");
const { analyze } = require("../services/matching/localMatchingProvider");
const { extractSkills } = require("../services/matching/skillMatcher");

const app = express();
app.use(express.json());
app.use("/api/matching", matchingRoutes);
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({ message: "Server error" });
});

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
const authHeader = `Bearer ${token}`;

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

const originalFindOne = Resume.findOne;
let resumeResult = null;
let findOneCalls = [];

beforeEach(() => {
    resumeResult = null;
    findOneCalls = [];
    Resume.findOne = async (filter) => {
        findOneCalls.push(filter);
        return resumeResult;
    };
});

after(() => {
    Resume.findOne = originalFindOne;
});

const postAnalysis = (payload, options = {}) => {
    const call = request(app).post("/api/matching/analyze");

    if (options.authorized !== false) {
        call.set("Authorization", authHeader);
    }

    return call.send(payload);
};

test("requires authentication", async () => {
    const response = await postAnalysis({ jobDescription: JOB_DESCRIPTION }, { authorized: false });

    assert.equal(response.status, 401);
    assert.equal(findOneCalls.length, 0);
});

test("rejects a missing or short job description before querying resumes", async () => {
    const missing = await postAnalysis({});
    const short = await postAnalysis({ jobDescription: "Too short" });

    assert.equal(missing.status, 400);
    assert.equal(short.status, 400);
    assert.equal(findOneCalls.length, 0);
});

test("rejects an oversized job description", async () => {
    const response = await postAnalysis({ jobDescription: "a".repeat(30001) });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /30,000|30000/);
    assert.equal(findOneCalls.length, 0);
});

test("rejects an invalid resume ID", async () => {
    const response = await postAnalysis({
        jobDescription: JOB_DESCRIPTION,
        resumeId: "not-an-object-id",
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Invalid resume ID");
    assert.equal(findOneCalls.length, 0);
});

test("uses the active resume when no resume ID is provided", async () => {
    resumeResult = null;

    const response = await postAnalysis({ jobDescription: JOB_DESCRIPTION });

    assert.equal(response.status, 404);
    assert.match(response.body.message, /No active resume/);
    assert.deepEqual(findOneCalls[0], { user: userId, isActive: true });
});

test("returns not found for a resume the user does not own", async () => {
    resumeResult = null;

    const response = await postAnalysis({
        jobDescription: JOB_DESCRIPTION,
        resumeId: new mongoose.Types.ObjectId().toString(),
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.message, "Resume not found");
    assert.equal(findOneCalls[0].user, userId);
});

test("rejects resumes without usable extracted text", async () => {
    resumeResult = { extractedText: "   " };

    const response = await postAnalysis({ jobDescription: JOB_DESCRIPTION });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /usable extracted text/);
});

test("returns a deterministic explainable analysis", async () => {
    resumeResult = {
        extractedText: RESUME_TEXT,
        storedFilename: "private-file.pdf",
    };

    const first = await postAnalysis({ jobDescription: JOB_DESCRIPTION });
    const second = await postAnalysis({ jobDescription: JOB_DESCRIPTION });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(first.body, second.body);
    assert.equal(first.body.provider, "local");
    assert.equal(typeof first.body.matchScore, "number");
    assert.equal(first.body.matchScore, second.body.matchScore);
    assert.ok(first.body.matchedSkills.some((skill) => skill.name === "React"));
    assert.ok(first.body.missingSkills.some((skill) => skill.name === "TypeScript"));
    assert.ok(first.body.missingSkills.some((skill) => skill.name === "AWS"));
    assert.equal(first.body.scoreBreakdown.skills.weight, 55);
    assert.equal(first.body.scoreBreakdown.keywords.weight, 15);
    assert.equal(first.body.scoreBreakdown.experience.weight, 20);
    assert.equal(first.body.scoreBreakdown.education.weight, 10);
    assert.ok(Array.isArray(first.body.strengths));
    assert.ok(first.body.strengths.length > 0);
    assert.ok(Array.isArray(first.body.improvements));
    assert.ok(first.body.improvements.length > 0);
    assert.equal(first.body.experienceAnalysis.candidateYears, 4);
    assert.equal(first.body.experienceAnalysis.meetsRequirement, true);
    assert.equal(first.body.educationAnalysis.meetsRequirement, true);
    assert.equal(first.body.educationAnalysis.fieldMatch, true);
    assert.equal(Object.hasOwn(first.body, "extractedText"), false);
    assert.equal(Object.hasOwn(first.body, "storedFilename"), false);
});

test("checks explicit resume IDs against the authenticated user", async () => {
    const resumeId = new mongoose.Types.ObjectId().toString();
    resumeResult = { extractedText: RESUME_TEXT };

    const response = await postAnalysis({
        jobDescription: JOB_DESCRIPTION,
        resumeId,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(findOneCalls[0], { _id: resumeId, user: userId });
});

test("does not treat JavaScript as a match for Java", () => {
    const jobSkills = extractSkills("Java developer with strong communication skills.");
    const resumeSkills = extractSkills("JavaScript developer with strong communication skills.");
    const jobSkillNames = jobSkills.map((skill) => skill.name);
    const resumeSkillNames = resumeSkills.map((skill) => skill.name);

    assert.ok(jobSkillNames.includes("Java"));
    assert.ok(resumeSkillNames.includes("JavaScript"));
    assert.equal(resumeSkillNames.includes("Java"), false);
});

test("awards partial credit and reports related skills for transferable experience", () => {
    const job = [
        "We need a developer with 2 years of experience.",
        "The role requires TypeScript, React, Node.js, and communication skills.",
        "A Bachelor's degree is required.",
    ].join(" ");
    const resume = [
        "Developer with 3 years of experience using JavaScript, React, and Node.js.",
        "B.S. in Computer Science. Strong communication skills.",
    ].join(" ");
    const analysis = analyze(resume, job);
    const missingTypeScript = analysis.missingSkills.find((skill) => skill.name === "TypeScript");

    assert.ok(missingTypeScript);
    assert.equal(missingTypeScript.relatedSkill, "JavaScript");
    assert.ok(analysis.relatedSkills.some((skill) => (
        skill.jobSkill === "TypeScript" && skill.resumeSkill === "JavaScript"
    )));
    assert.ok(analysis.scoreBreakdown.skills.score > 0);
    assert.ok(analysis.scoreBreakdown.skills.relatedCount > 0);
});
