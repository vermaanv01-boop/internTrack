const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test-jwt-secret-for-interview-lifecycle";

const InterviewPrepSession = require("../models/interviewPrepSessionModel");
const interviewPrepRoutes = require("../routes/interviewPrepRoutes");
const {
    EVALUATION_FALLBACK_REASON,
    evaluateInterviewAnswer,
    registerEvaluationProvider,
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

const QUESTIONS = [
    {
        questionId: "q-001",
        text: "Explain how you would use JavaScript and testing to solve a production problem.",
        category: "technical",
        difficulty: "beginner",
        whyRelevant: "JavaScript is required by the job.",
        keyConcepts: ["JavaScript fundamentals", "testing", "tradeoffs"],
        evaluationCriteria: [
            "Explains the core JavaScript behavior accurately",
            "Identifies tradeoffs and a validation approach",
            "Uses specific evidence",
        ],
    },
    {
        questionId: "q-002",
        text: "How would you assess validation and tradeoffs before deployment?",
        category: "technical",
        difficulty: "intermediate",
        whyRelevant: "The role requires production delivery.",
        keyConcepts: ["tradeoffs", "validation", "monitoring"],
        evaluationCriteria: [
            "Explains validation steps",
            "Identifies tradeoffs",
            "Defines how outcomes would be observed",
        ],
    },
    {
        questionId: "q-003",
        text: "Tell me about a time you disagreed with a teammate.",
        category: "behavioral",
        difficulty: "intermediate",
        whyRelevant: "Collaboration is important.",
        keyConcepts: ["situation", "action", "result", "communication"],
        evaluationCriteria: [
            "Describes a specific situation and action",
            "Explains the result",
            "Shows reflection",
        ],
    },
    {
        questionId: "q-004",
        text: "How would you prioritize your first 30 days?",
        category: "role-specific",
        difficulty: "advanced",
        whyRelevant: "The role requires onboarding and prioritization.",
        keyConcepts: ["prioritization", "communication", "delivery planning"],
        evaluationCriteria: [
            "Prioritizes by impact",
            "Explains stakeholder communication",
            "Defines measurable outcomes",
        ],
    },
];

const ANSWER_TEXT = [
    "I used JavaScript to build the feature and wrote tests for the edge cases.",
    "For example, I validated the result, measured the outcome, and reduced failures by 20 percent.",
    "The main tradeoff was speed versus reliability, so I monitored the release and documented the decision.",
].join(" ");

const clone = (value) => JSON.parse(JSON.stringify(value));

let store = [];
let saveCalls = 0;

const makeSession = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    user: ownerId,
    resume: new mongoose.Types.ObjectId(),
    resumeSnapshot: {
        originalName: "resume.pdf",
        extractedTextLength: 500,
    },
    jobDescription: "A detailed job description requiring JavaScript, testing, and communication.",
    jobTitle: "Software Engineer",
    company: "InternTrack",
    difficulty: "mixed",
    questions: QUESTIONS.map((question) => ({ ...question })),
    categoriesCovered: ["technical", "behavioral", "role-specific"],
    questionCount: QUESTIONS.length,
    status: "not_started",
    startedAt: null,
    completedAt: null,
    currentQuestionIndex: 0,
    answers: [],
    overallScore: null,
    provider: "local",
    providerType: "local",
    fallbackUsed: false,
    fallbackReason: null,
    disclaimer: "Review these questions before use.",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    save: async function save() {
        saveCalls += 1;
        this.updatedAt = new Date();
        return this;
    },
    ...overrides,
});

const matchesFilter = (document, filter) => Object.entries(filter).every(([key, expected]) => {
    if (expected instanceof RegExp) {
        return expected.test(String(document[key] || ""));
    }

    return String(document[key]) === String(expected);
});

const originalFindOne = InterviewPrepSession.findOne;

beforeEach(() => {
    store = [];
    saveCalls = 0;
    InterviewPrepSession.findOne = async (filter) => (
        store.find((document) => matchesFilter(document, filter)) || null
    );
});

after(() => {
    InterviewPrepSession.findOne = originalFindOne;
});

const postStart = (id, options = {}) => {
    const call = request(app).post(`/api/interview-prep/${id}/start`);

    if (options.authorized !== false) {
        call.set("Authorization", options.token || `Bearer ${ownerToken}`);
    }

    return call;
};

const postAnswer = (id, payload, options = {}) => {
    const call = request(app).post(`/api/interview-prep/${id}/answer`);

    if (options.authorized !== false) {
        call.set("Authorization", options.token || `Bearer ${ownerToken}`);
    }

    return call.send(payload);
};

const postComplete = (id, options = {}) => {
    const call = request(app).post(`/api/interview-prep/${id}/complete`);

    if (options.authorized !== false) {
        call.set("Authorization", options.token || `Bearer ${ownerToken}`);
    }

    return call;
};

const startStoredSession = async () => {
    const session = makeSession();
    store.push(session);
    const response = await postStart(session._id);

    assert.equal(response.status, 200);

    return { session, response };
};

test("requires authentication for start, answer, and complete", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const responses = await Promise.all([
        postStart(id, { authorized: false }),
        postAnswer(id, { questionId: "q-001", answer: ANSWER_TEXT }, { authorized: false }),
        postComplete(id, { authorized: false }),
    ]);

    for (const response of responses) {
        assert.equal(response.status, 401);
    }
});

test("starts a not-started session once and initializes lifecycle fields", async () => {
    const session = makeSession();
    store.push(session);

    const response = await postStart(session._id);

    assert.equal(response.status, 200);
    assert.equal(response.body.session.status, "in_progress");
    assert.ok(response.body.session.startedAt);
    assert.equal(response.body.session.completedAt, null);
    assert.equal(response.body.session.currentQuestionIndex, 0);
    assert.equal(response.body.session.overallScore, null);
    assert.equal(response.body.session.answeredCount, 0);
    assert.equal(response.body.session.currentQuestion.questionId, "q-001");
    assert.equal(session.status, "in_progress");
    assert.equal(saveCalls, 1);
});

test("rejects duplicate starts without changing the original start time", async () => {
    const { session } = await startStoredSession();
    const startedAt = session.startedAt;
    const response = await postStart(session._id);

    assert.equal(response.status, 409);
    assert.match(response.body.message, /already been started/);
    assert.equal(session.startedAt, startedAt);
    assert.equal(session.status, "in_progress");
});

test("rejects starting completed or empty sessions", async () => {
    const completed = makeSession({
        status: "completed",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        completedAt: new Date("2026-01-02T00:00:00.000Z"),
        overallScore: 80,
    });
    const empty = makeSession({ questions: [], questionCount: 0 });
    store.push(completed, empty);

    const completedResponse = await postStart(completed._id);
    const emptyResponse = await postStart(empty._id);

    assert.equal(completedResponse.status, 409);
    assert.match(completedResponse.body.message, /Completed interviews/);
    assert.equal(emptyResponse.status, 409);
    assert.match(emptyResponse.body.message, /no questions/);
});

test("returns 400 for invalid session IDs and 404 for cross-user sessions", async () => {
    const otherSession = makeSession({ user: otherUserId });
    store.push(otherSession);

    const invalidStart = await postStart("not-an-object-id");
    const crossStart = await postStart(otherSession._id);
    const crossAnswer = await postAnswer(otherSession._id, {
        questionId: "q-001",
        answer: ANSWER_TEXT,
    });
    const crossComplete = await postComplete(otherSession._id);

    assert.equal(invalidStart.status, 400);
    assert.equal(invalidStart.body.message, "Invalid session ID");
    assert.equal(crossStart.status, 404);
    assert.equal(crossAnswer.status, 404);
    assert.equal(crossComplete.status, 404);
});

test("validates answer length and question IDs before evaluation", async () => {
    const { session } = await startStoredSession();
    const responses = await Promise.all([
        postAnswer(session._id, { questionId: "q-001" }),
        postAnswer(session._id, { questionId: "q-001", answer: "Too short" }),
        postAnswer(session._id, { questionId: "q-001", answer: "x".repeat(5001) }),
        postAnswer(session._id, { questionId: 42, answer: ANSWER_TEXT }),
    ]);

    for (const response of responses) {
        assert.equal(response.status, 400);
        assert.equal(response.body.message, "Validation failed");
    }

    const unknownQuestion = await postAnswer(session._id, {
        questionId: "q-999",
        answer: ANSWER_TEXT,
    });

    assert.equal(unknownQuestion.status, 404);
    assert.equal(unknownQuestion.body.message, "Question not found in this session");
    assert.equal(session.answers.length, 0);
});

test("requires an in-progress session for answers", async () => {
    const notStarted = makeSession();
    const completed = makeSession({
        status: "completed",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        completedAt: new Date("2026-01-02T00:00:00.000Z"),
        overallScore: 75,
    });
    store.push(notStarted, completed);

    const notStartedResponse = await postAnswer(notStarted._id, {
        questionId: "q-001",
        answer: ANSWER_TEXT,
    });
    const completedResponse = await postAnswer(completed._id, {
        questionId: "q-001",
        answer: ANSWER_TEXT,
    });

    assert.equal(notStartedResponse.status, 409);
    assert.match(notStartedResponse.body.message, /must be started/);
    assert.equal(completedResponse.status, 409);
    assert.match(completedResponse.body.message, /Completed interviews/);
});

test("evaluates an answer, records it, and preserves generated questions", async () => {
    const { session } = await startStoredSession();
    const questionsBefore = clone(session.questions);
    const criteriaBefore = clone(session.questions.map((question) => question.evaluationCriteria));
    const response = await postAnswer(session._id, {
        questionId: "q-001",
        answer: `  ${ANSWER_TEXT}  `,
        keyConcepts: ["tampered concept"],
        evaluationCriteria: ["tampered criterion"],
        questions: [{ questionId: "q-999", text: "Injected question" }],
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.answer.questionId, "q-001");
    assert.equal(response.body.answer.answerText, ANSWER_TEXT);
    assert.ok(response.body.answer.submittedAt);
    assert.equal(typeof response.body.answer.score, "number");
    assert.ok(response.body.answer.score >= 0 && response.body.answer.score <= 100);
    assert.ok(response.body.answer.strengths.length > 0);
    assert.ok(response.body.answer.weaknesses.length > 0);
    assert.ok(Array.isArray(response.body.answer.missingConcepts));
    assert.ok(response.body.answer.improvementSuggestions.length > 0);
    assert.equal(response.body.answer.evaluationProvider, "local");
    assert.equal(response.body.answer.evaluationProviderType, "local");
    assert.equal(response.body.answer.evaluationFallbackUsed, false);
    assert.match(response.body.answer.evaluationMethod, /not semantic AI evaluation/);
    assert.equal(response.body.progress.status, "in_progress");
    assert.equal(response.body.progress.answeredCount, 1);
    assert.equal(response.body.progress.unansweredCount, 3);
    assert.equal(response.body.progress.currentQuestionIndex, 1);
    assert.equal(response.body.progress.currentQuestion.questionId, "q-002");
    assert.equal(session.answers.length, 1);
    assert.equal(session.answers[0].score, response.body.answer.score);
    assert.equal(session.answers[0].evaluationProvider, "local");
    assert.equal(session.currentQuestionIndex, 1);
    assert.deepEqual(clone(session.questions), questionsBefore);
    assert.deepEqual(
        clone(session.questions.map((question) => question.evaluationCriteria)),
        criteriaBefore,
    );
});

test("rejects duplicate answers for the same question", async () => {
    const { session } = await startStoredSession();
    const first = await postAnswer(session._id, {
        questionId: "q-001",
        answer: ANSWER_TEXT,
    });
    const second = await postAnswer(session._id, {
        questionId: "q-001",
        answer: `${ANSWER_TEXT} Revised.`,
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.match(second.body.message, /already been submitted/);
    assert.equal(session.answers.length, 1);
    assert.equal(session.answers[0].answerText, ANSWER_TEXT);
});

test("moves to the first unanswered question when answers are submitted out of order", async () => {
    const { session } = await startStoredSession();
    const response = await postAnswer(session._id, {
        questionId: "q-002",
        answer: ANSWER_TEXT,
    });

    assert.equal(response.status, 200);
    assert.equal(session.currentQuestionIndex, 0);
    assert.equal(response.body.progress.currentQuestion.questionId, "q-001");
});

test("local evaluation is deterministic and explicitly non-semantic", () => {
    const input = {
        question: QUESTIONS[0],
        answerText: ANSWER_TEXT,
    };
    const first = evaluateInterviewAnswer(input);
    const second = evaluateInterviewAnswer(input);

    assert.deepEqual(first, second);
    assert.equal(first.evaluationProvider, "local");
    assert.equal(first.evaluationProviderType, "local");
    assert.equal(first.evaluationFallbackUsed, false);
    assert.match(first.evaluationMethod, /not semantic AI evaluation/);
    assert.ok(first.score > 0);
    assert.ok(first.strengths.length > 0);
    assert.ok(first.weaknesses.length > 0);
    assert.ok(Array.isArray(first.improvementSuggestions));
});

test("uses an explicitly registered evaluation provider and falls back on failure", () => {
    registerEvaluationProvider("mock-ai-evaluator", {
        type: "ai",
        evaluate() {
            return {
                score: 91,
                strengths: ["Clear structure."],
                weaknesses: ["Could add metrics."],
                missingConcepts: [],
                improvementSuggestions: ["Add a measured outcome."],
                methodology: "Mock AI evaluation.",
            };
        },
    });
    registerEvaluationProvider("failing-ai-evaluator", {
        type: "ai",
        evaluate() {
            throw new Error("AI provider unavailable");
        },
    });

    const success = evaluateInterviewAnswer({
        question: QUESTIONS[0],
        answerText: ANSWER_TEXT,
    }, {
        provider: "mock-ai-evaluator",
    });
    const failure = evaluateInterviewAnswer({
        question: QUESTIONS[0],
        answerText: ANSWER_TEXT,
    }, {
        provider: "failing-ai-evaluator",
    });

    assert.equal(success.evaluationProvider, "mock-ai-evaluator");
    assert.equal(success.evaluationProviderType, "ai");
    assert.equal(success.evaluationFallbackUsed, false);
    assert.equal(success.score, 91);
    assert.equal(failure.evaluationProvider, "local");
    assert.equal(failure.evaluationProviderType, "local");
    assert.equal(failure.evaluationFallbackUsed, true);
    assert.equal(failure.evaluationFallbackReason, EVALUATION_FALLBACK_REASON);
});

test("falls back to local evaluation when the provider is unknown", () => {
    const result = evaluateInterviewAnswer({
        question: QUESTIONS[0],
        answerText: ANSWER_TEXT,
    }, {
        provider: "not-registered",
    });

    assert.equal(result.evaluationProvider, "local");
    assert.equal(result.evaluationFallbackUsed, true);
    assert.equal(result.evaluationFallbackReason, EVALUATION_FALLBACK_REASON);
});

test("completes an interview with category performance and no overwrite on repeat", async () => {
    const { session } = await startStoredSession();
    const technicalOne = await postAnswer(session._id, {
        questionId: "q-001",
        answer: ANSWER_TEXT,
    });
    const technicalTwo = await postAnswer(session._id, {
        questionId: "q-002",
        answer: "I would identify tradeoffs and define validation because monitoring the outcome matters.",
    });
    const behavioral = await postAnswer(session._id, {
        questionId: "q-003",
        answer: "The situation was a disagreement about delivery. My action was to compare the result with evidence, and the outcome was a faster release.",
    });

    assert.equal(technicalOne.status, 200);
    assert.equal(technicalTwo.status, 200);
    assert.equal(behavioral.status, 200);

    const completion = await postComplete(session._id);

    assert.equal(completion.status, 200);
    const result = completion.body.result;
    const expectedOverall = Math.round((
        technicalOne.body.answer.score
        + technicalTwo.body.answer.score
        + behavioral.body.answer.score
    ) / 3);
    const technical = result.categoryPerformance.find((item) => item.category === "technical");
    const behavioralCategory = result.categoryPerformance.find((item) => item.category === "behavioral");
    const roleSpecific = result.categoryPerformance.find((item) => item.category === "role-specific");

    assert.equal(result.overallScore, expectedOverall);
    assert.equal(completion.body.session.overallScore, expectedOverall);
    assert.equal(result.questionsAttempted, 3);
    assert.equal(result.questionsUnanswered, 1);
    assert.deepEqual(result.unansweredQuestionIds, ["q-004"]);
    assert.equal(technical.total, 2);
    assert.equal(technical.attempted, 2);
    assert.equal(technical.unanswered, 0);
    assert.equal(
        technical.averageScore,
        Math.round((technicalOne.body.answer.score + technicalTwo.body.answer.score) / 2),
    );
    assert.equal(behavioralCategory.averageScore, behavioral.body.answer.score);
    assert.equal(roleSpecific.attempted, 0);
    assert.equal(roleSpecific.averageScore, null);
    assert.deepEqual(
        result.strongestAreas,
        [behavioralCategory, technical]
            .sort((left, right) => (
                right.averageScore - left.averageScore || left.category.localeCompare(right.category)
            ))
            .map((item) => item.category),
    );
    assert.equal(result.strongestAreas.includes("role-specific"), false);
    assert.equal(result.weakestAreas.includes("role-specific"), false);
    assert.ok(result.recommendedTopics.length > 0);
    assert.deepEqual(result.recommendedTopicsToRevise, result.recommendedTopics);
    assert.equal(completion.body.session.status, "completed");
    assert.ok(completion.body.session.completedAt);
    assert.equal(saveCalls, 5);

    const completedAt = session.completedAt;
    const repeated = await postComplete(session._id);

    assert.equal(repeated.status, 409);
    assert.match(repeated.body.message, /already been completed/);
    assert.equal(session.completedAt, completedAt);
    assert.equal(session.overallScore, expectedOverall);
    assert.equal(saveCalls, 5);
});

test("completes with unanswered questions and a zero score when nothing was attempted", async () => {
    const { session } = await startStoredSession();
    const completion = await postComplete(session._id);

    assert.equal(completion.status, 200);
    assert.equal(completion.body.result.overallScore, 0);
    assert.equal(completion.body.result.questionsAttempted, 0);
    assert.equal(completion.body.result.questionsUnanswered, 4);
    assert.deepEqual(completion.body.result.attemptedQuestionIds, []);
    assert.deepEqual(
        completion.body.result.unansweredQuestionIds,
        ["q-001", "q-002", "q-003", "q-004"],
    );
    assert.ok(completion.body.result.categoryPerformance.every((item) => item.attempted === 0));
    assert.deepEqual(completion.body.result.strongestAreas, []);
    assert.deepEqual(completion.body.result.weakestAreas, []);
    assert.ok(completion.body.result.recommendedTopics.length > 0);
    assert.equal(completion.body.session.overallScore, 0);
});

test("rejects completion before the interview is started", async () => {
    const session = makeSession();
    store.push(session);

    const response = await postComplete(session._id);

    assert.equal(response.status, 409);
    assert.match(response.body.message, /must be started/);
    assert.equal(session.status, "not_started");
    assert.equal(session.overallScore, null);
});
