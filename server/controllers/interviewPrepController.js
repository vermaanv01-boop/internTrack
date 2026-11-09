const mongoose = require("mongoose");
const InterviewPrepSession = require("../models/interviewPrepSessionModel");
const Resume = require("../models/resumeModel");
const { evaluateInterviewAnswer, generateInterviewQuestions } = require("../services/interviewPrep");
const { DIFFICULTIES } = require("../services/interviewPrep/constants");

const MIN_JOB_DESCRIPTION_LENGTH = 100;
const MAX_JOB_DESCRIPTION_LENGTH = 30000;
const MIN_ANSWER_LENGTH = 20;
const MAX_ANSWER_LENGTH = 5000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SORT_ORDERS = ["newest", "oldest"];
const SESSION_STATUSES = ["not_started", "in_progress", "completed"];
const DISCLAIMER = "Interview questions are generated from the selected resume and job description. Review and adapt them before use.";

class RequestValidationError extends Error {
    constructor(errors, message = "Validation failed") {
        super(message);
        this.name = "RequestValidationError";
        this.errors = errors;
    }
}

const cloneSnapshot = (value) => {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value));
};

const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];

const parseOptionalMetadata = (value) => {
    if (value === undefined) {
        return { valid: true, value: undefined };
    }

    if (value === null || value === "") {
        return { valid: true, value: null };
    }

    if (typeof value !== "string") {
        return { valid: false };
    }

    const trimmed = value.trim();

    return { valid: true, value: trimmed || null };
};

const parseDifficulty = (value) => {
    if (value === undefined) {
        return { valid: true, value: "mixed" };
    }

    if (typeof value !== "string") {
        return { valid: false };
    }

    const normalized = value.trim().toLowerCase();

    return {
        valid: DIFFICULTIES.includes(normalized),
        value: normalized,
    };
};

const parsePositiveInteger = (value, field, fallback, maximum, errors) => {
    if (value === undefined) {
        return fallback;
    }

    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        errors[field] = `${field} must be a positive integer`;
        return fallback;
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        errors[field] = `${field} must be a positive integer`;
        return fallback;
    }

    if (maximum !== null && parsed > maximum) {
        errors[field] = `${field} must not exceed ${maximum}`;
        return fallback;
    }

    return parsed;
};

const parseHistoryQuery = (query) => {
    const errors = {};
    const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE, null, errors);
    const limit = parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT, MAX_LIMIT, errors);
    let difficulty;

    if (query.difficulty !== undefined) {
        const parsedDifficulty = parseDifficulty(query.difficulty);

        if (!parsedDifficulty.valid) {
            errors.difficulty = `difficulty must be one of: ${DIFFICULTIES.join(", ")}`;
        } else {
            difficulty = parsedDifficulty.value;
        }
    }

    let search;

    if (query.search !== undefined) {
        if (typeof query.search !== "string") {
            errors.search = "search must be a string";
        } else {
            search = query.search.trim() || undefined;
        }
    }

    let sort = "newest";

    if (query.sort !== undefined) {
        if (typeof query.sort !== "string") {
            errors.sort = "sort must be newest or oldest";
        } else {
            sort = query.sort.trim().toLowerCase();

            if (!SORT_ORDERS.includes(sort)) {
                errors.sort = "sort must be newest or oldest";
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new RequestValidationError(errors);
    }

    return { page, limit, difficulty, search, sort };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPlainObject = (document) => (
    document && typeof document.toObject === "function" ? document.toObject() : document
);

const getSessionStatus = (session) => {
    const status = session && session.status;

    return SESSION_STATUSES.includes(status) ? status : "not_started";
};

const getSessionQuestions = (session) => (
    Array.isArray(session && session.questions) ? session.questions : []
);

const getSessionAnswers = (session) => (
    Array.isArray(session && session.answers) ? session.answers : []
);

const getQuestionId = (question) => (
    question && typeof question.questionId === "string" ? question.questionId : null
);

const normalizeQuestion = (question, index) => {
    const raw = toPlainObject(question) || {};
    const questionId = typeof raw.questionId === "string" && raw.questionId.trim()
        ? raw.questionId.trim()
        : typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : `q-${String(index + 1).padStart(3, "0")}`;
    const text = typeof raw.text === "string"
        ? raw.text.trim()
        : typeof raw.question === "string"
            ? raw.question.trim()
            : "";
    const whyRelevant = typeof raw.whyRelevant === "string"
        ? raw.whyRelevant.trim()
        : typeof raw.relevance === "string"
            ? raw.relevance.trim()
            : null;

    return {
        questionId,
        text,
        category: typeof raw.category === "string" ? raw.category.trim() : "",
        difficulty: typeof raw.difficulty === "string" ? raw.difficulty.trim().toLowerCase() : "",
        whyRelevant,
        keyConcepts: Array.isArray(raw.keyConcepts) ? cloneSnapshot(raw.keyConcepts.map(String)) : [],
        evaluationCriteria: Array.isArray(raw.evaluationCriteria)
            ? cloneSnapshot(raw.evaluationCriteria.map(String))
            : [],
    };
};

const buildSnapshot = ({ userId, resume, extractedText, jobDescription, jobTitle, company, difficulty, generated }) => {
    const questions = generated.questions.map(normalizeQuestion);

    return {
        user: userId,
        resume: resume._id || resume.id,
        resumeSnapshot: {
            originalName: resume.originalName || null,
            mimeType: resume.mimeType || null,
            fileSize: resume.fileSize || 0,
            extractedTextLength: extractedText.length,
        },
        jobDescription,
        jobTitle: jobTitle === undefined ? null : jobTitle,
        company: company === undefined ? null : company,
        difficulty,
        questions,
        categoriesCovered: generated.categoriesCovered || [...new Set(questions.map((question) => question.category))],
        questionCount: questions.length,
        provider: generated.provider || null,
        providerType: generated.providerType || null,
        fallbackUsed: Boolean(generated.fallbackUsed),
        fallbackReason: generated.fallbackReason || null,
        disclaimer: DISCLAIMER,
    };
};

const serializeQuestion = (question) => {
    const raw = toPlainObject(question) || {};
    const questionId = raw.questionId || raw.id || null;
    const text = raw.text || raw.question || "";

    return {
        id: questionId,
        questionId,
        text,
        question: text,
        category: raw.category,
        difficulty: raw.difficulty,
        whyRelevant: raw.whyRelevant || null,
        relevance: raw.whyRelevant || null,
        keyConcepts: Array.isArray(raw.keyConcepts) ? raw.keyConcepts : [],
        evaluationCriteria: Array.isArray(raw.evaluationCriteria) ? raw.evaluationCriteria : [],
    };
};

const serializeAnswer = (answer) => {
    const raw = toPlainObject(answer) || {};
    const providerType = raw.evaluationProviderType || null;
    const score = raw.score === null || raw.score === undefined
        ? null
        : Number.isFinite(Number(raw.score))
            ? Number(raw.score)
            : null;

    return {
        questionId: raw.questionId || null,
        answerText: raw.answerText || "",
        submittedAt: raw.submittedAt || null,
        score,
        strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
        weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses : [],
        missingConcepts: Array.isArray(raw.missingConcepts) ? raw.missingConcepts : [],
        improvementSuggestions: Array.isArray(raw.improvementSuggestions)
            ? raw.improvementSuggestions
            : [],
        evaluationProvider: raw.evaluationProvider || null,
        evaluationProviderType: providerType,
        evaluationFallbackUsed: Boolean(raw.evaluationFallbackUsed),
        evaluationFallbackReason: raw.evaluationFallbackReason || null,
        evaluationMethod: providerType === "local"
            ? "Deterministic local concept matching; not semantic AI evaluation."
            : "Provider-reported answer evaluation.",
    };
};

const serializeSessionSummary = (session) => {
    const raw = toPlainObject(session);
    const answers = getSessionAnswers(raw);

    return {
        id: raw._id ? String(raw._id) : null,
        _id: raw._id,
        resume: raw.resume,
        resumeId: raw.resume ? String(raw.resume) : null,
        jobTitle: raw.jobTitle || null,
        company: raw.company || null,
        difficulty: raw.difficulty,
        questionCount: raw.questionCount || 0,
        answeredCount: answers.length,
        status: getSessionStatus(raw),
        currentQuestionIndex: Number.isInteger(raw.currentQuestionIndex) ? raw.currentQuestionIndex : 0,
        overallScore: raw.overallScore === null || raw.overallScore === undefined
            ? null
            : Number.isFinite(Number(raw.overallScore))
                ? Number(raw.overallScore)
                : null,
        categoriesCovered: Array.isArray(raw.categoriesCovered) ? raw.categoriesCovered : [],
        provider: raw.provider || null,
        providerType: raw.providerType || null,
        fallbackUsed: Boolean(raw.fallbackUsed),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
};

const serializeSessionDetail = (session) => {
    const raw = toPlainObject(session);
    const questions = getSessionQuestions(raw).map(serializeQuestion);
    const answers = getSessionAnswers(raw).map(serializeAnswer);
    const status = getSessionStatus(raw);
    const currentQuestionIndex = Number.isInteger(raw.currentQuestionIndex) && raw.currentQuestionIndex >= 0
        ? raw.currentQuestionIndex
        : 0;
    const answeredQuestionIds = answers.map((answer) => answer.questionId);
    const currentQuestion = status === "in_progress" && currentQuestionIndex < questions.length
        ? questions[currentQuestionIndex]
        : null;

    return {
        id: raw._id ? String(raw._id) : null,
        _id: raw._id,
        user: raw.user,
        resume: raw.resume,
        resumeId: raw.resume ? String(raw.resume) : null,
        resumeSnapshot: raw.resumeSnapshot || {},
        jobDescription: raw.jobDescription,
        jobTitle: raw.jobTitle || null,
        company: raw.company || null,
        difficulty: raw.difficulty,
        requestedDifficulty: raw.difficulty,
        questions,
        categoriesCovered: Array.isArray(raw.categoriesCovered) ? raw.categoriesCovered : [],
        questionCount: raw.questionCount || questions.length,
        status,
        startedAt: raw.startedAt || null,
        completedAt: raw.completedAt || null,
        currentQuestionIndex,
        currentQuestion,
        answers,
        answeredCount: answers.length,
        answeredQuestionIds,
        unansweredCount: Math.max(0, questions.length - answers.length),
        overallScore: raw.overallScore === null || raw.overallScore === undefined
            ? null
            : Number.isFinite(Number(raw.overallScore))
                ? Number(raw.overallScore)
                : null,
        provider: raw.provider || null,
        providerType: raw.providerType || null,
        fallbackUsed: Boolean(raw.fallbackUsed),
        fallbackReason: raw.fallbackReason || null,
        disclaimer: raw.disclaimer || null,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
};

const formatMongooseValidationError = (error) => {
    const errors = {};

    for (const [field, detail] of Object.entries(error.errors || {})) {
        errors[field] = detail.message;
    }

    return errors;
};

const handleControllerError = (res, error, context) => {
    if (error instanceof RequestValidationError) {
        return res.status(400).json({
            message: error.message,
            errors: error.errors,
        });
    }

    if (error && error.name === "ValidationError") {
        return res.status(400).json({
            message: "Validation failed",
            errors: formatMongooseValidationError(error),
        });
    }

    if (error && error.name === "CastError") {
        return res.status(400).json({ message: "Invalid ID" });
    }

    console.error(context, error);
    return res.status(500).json({ message: "Server error" });
};

const buildCategoryPerformance = (session) => {
    const questions = getSessionQuestions(session);
    const answers = getSessionAnswers(session);
    const answerMap = new Map(
        answers
            .filter((answer) => typeof answer.questionId === "string")
            .map((answer) => [answer.questionId, answer]),
    );
    const categories = uniqueStrings(questions.map((question) => question.category));

    return categories.map((category) => {
        const categoryQuestions = questions.filter((question) => question.category === category);
        const scores = [];
        let attempted = 0;

        for (const question of categoryQuestions) {
            const answer = answerMap.get(getQuestionId(question));

            if (!answer) {
                continue;
            }

            attempted += 1;

            const score = Number(answer.score);

            if (Number.isFinite(score)) {
                scores.push(score);
            }
        }

        return {
            category,
            total: categoryQuestions.length,
            attempted,
            unanswered: categoryQuestions.length - attempted,
            averageScore: scores.length > 0
                ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
                : null,
        };
    });
};

const calculateOverallScore = (answers) => {
    const scores = answers
        .map((answer) => Number(answer.score))
        .filter((score) => Number.isFinite(score));

    if (scores.length === 0) {
        return 0;
    }

    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
};

const buildCompletionResult = (session) => {
    const questions = getSessionQuestions(session);
    const answers = getSessionAnswers(session);
    const overallScore = calculateOverallScore(answers);
    const categoryPerformance = buildCategoryPerformance(session);
    const attemptedCategories = categoryPerformance.filter((category) => category.attempted > 0);
    const strongestAreas = [...attemptedCategories]
        .sort((left, right) => (
            right.averageScore - left.averageScore || left.category.localeCompare(right.category)
        ))
        .slice(0, 3)
        .map((category) => category.category);
    const weakestAreas = [...attemptedCategories]
        .sort((left, right) => (
            left.averageScore - right.averageScore || left.category.localeCompare(right.category)
        ))
        .slice(0, 3)
        .map((category) => category.category);
    const answeredQuestionIds = uniqueStrings(answers.map((answer) => answer.questionId));
    const answeredSet = new Set(answeredQuestionIds);
    const unansweredQuestionIds = questions
        .map(getQuestionId)
        .filter((questionId) => questionId && !answeredSet.has(questionId));
    const missingConcepts = uniqueStrings(answers.flatMap((answer) => (
        Array.isArray(answer.missingConcepts) ? answer.missingConcepts : []
    )));
    const lowScoringTopics = attemptedCategories
        .filter((category) => category.averageScore !== null && category.averageScore < 70)
        .map((category) => `${category.category} concepts`);
    const unattemptedTopics = categoryPerformance
        .filter((category) => category.attempted === 0)
        .map((category) => `${category.category} practice`);
    const recommendedTopics = uniqueStrings([
        ...missingConcepts,
        ...lowScoringTopics,
        ...unattemptedTopics,
    ]).slice(0, 8);

    return {
        overallScore,
        questionsAttempted: answers.length,
        questionsUnanswered: Math.max(0, questions.length - answers.length),
        attemptedQuestionIds: answeredQuestionIds,
        unansweredQuestionIds,
        categoryPerformance,
        strongestAreas,
        weakestAreas,
        recommendedTopics: recommendedTopics.length > 0
            ? recommendedTopics
            : ["Timed answer practice and concise outcome summaries"],
        recommendedTopicsToRevise: recommendedTopics.length > 0
            ? recommendedTopics
            : ["Timed answer practice and concise outcome summaries"],
    };
};

const buildAnswerProgress = (session) => {
    const questions = getSessionQuestions(session).map(serializeQuestion);
    const answers = getSessionAnswers(session);
    const currentQuestionIndex = Number.isInteger(session.currentQuestionIndex)
        ? session.currentQuestionIndex
        : 0;

    return {
        status: getSessionStatus(session),
        questionCount: questions.length,
        answeredCount: answers.length,
        unansweredCount: Math.max(0, questions.length - answers.length),
        currentQuestionIndex,
        currentQuestion: currentQuestionIndex < questions.length ? questions[currentQuestionIndex] : null,
        allQuestionsAnswered: answers.length >= questions.length,
    };
};

const generateSession = async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobDescription = typeof body.jobDescription === "string"
        ? body.jobDescription.trim()
        : "";
    const errors = {};

    if (body.resumeId === undefined || body.resumeId === null || body.resumeId === "") {
        errors.resumeId = "Resume ID is required";
    } else if (typeof body.resumeId !== "string" || !mongoose.isValidObjectId(body.resumeId)) {
        errors.resumeId = "Invalid resume ID";
    }

    if (!jobDescription) {
        errors.jobDescription = "Job description is required";
    } else if (jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
        errors.jobDescription = `Job description must be at least ${MIN_JOB_DESCRIPTION_LENGTH} characters`;
    } else if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
        errors.jobDescription = `Job description must not exceed ${MAX_JOB_DESCRIPTION_LENGTH} characters`;
    }

    const jobTitleField = parseOptionalMetadata(body.jobTitle);
    const companyField = parseOptionalMetadata(body.company);
    const difficultyField = parseDifficulty(body.difficulty);

    if (!jobTitleField.valid) {
        errors.jobTitle = "Job title must be a string";
    }

    if (!companyField.valid) {
        errors.company = "Company must be a string";
    }

    if (!difficultyField.valid) {
        errors.difficulty = `difficulty must be one of: ${DIFFICULTIES.join(", ")}`;
    }

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            message: "Validation failed",
            errors,
        });
    }

    try {
        const resume = await Resume.findOne({
            _id: body.resumeId,
            user: req.user.id,
        });

        if (!resume) {
            return res.status(404).json({ message: "Resume not found" });
        }

        const extractedText = typeof resume.extractedText === "string"
            ? resume.extractedText.trim()
            : "";

        if (!extractedText) {
            return res.status(400).json({
                message: "Resume does not contain usable extracted text",
            });
        }

        const generated = generateInterviewQuestions({
            resumeText: extractedText,
            jobDescription,
            jobTitle: jobTitleField.value || null,
            company: companyField.value || null,
            difficulty: difficultyField.value,
        });
        const snapshot = buildSnapshot({
            userId: req.user.id,
            resume,
            extractedText,
            jobDescription,
            jobTitle: jobTitleField.value,
            company: companyField.value,
            difficulty: difficultyField.value,
            generated,
        });

        if (snapshot.questions.some((question) => !question.text || !question.category || !question.difficulty)) {
            return res.status(500).json({
                message: "Interview preparation provider returned an invalid question set",
            });
        }

        const session = await InterviewPrepSession.create(snapshot);

        return res.status(201).json({
            session: serializeSessionDetail(session),
        });
    } catch (error) {
        return handleControllerError(res, error, "Error generating interview preparation session");
    }
};

const startSession = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid session ID" });
    }

    try {
        const session = await InterviewPrepSession.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ message: "Interview preparation session not found" });
        }

        const status = getSessionStatus(session);
        const answers = getSessionAnswers(session);
        const questions = getSessionQuestions(session);

        if (status === "completed") {
            return res.status(409).json({ message: "Completed interviews cannot be restarted" });
        }

        if (status === "in_progress") {
            return res.status(409).json({ message: "Interview has already been started" });
        }

        if (session.startedAt || session.completedAt || answers.length > 0 || session.currentQuestionIndex > 0) {
            return res.status(409).json({
                message: "Session state is inconsistent and cannot be started",
            });
        }

        if (questions.length === 0) {
            return res.status(409).json({ message: "Session has no questions to start" });
        }

        session.status = "in_progress";
        session.startedAt = new Date();
        session.completedAt = null;
        session.currentQuestionIndex = 0;
        session.answers = [];
        session.overallScore = null;
        await session.save();

        return res.status(200).json({
            session: serializeSessionDetail(session),
        });
    } catch (error) {
        return handleControllerError(res, error, "Error starting interview preparation session");
    }
};

const submitAnswer = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid session ID" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
    const answerText = typeof body.answer === "string" ? body.answer.trim() : "";
    const errors = {};

    if (typeof body.questionId !== "string") {
        errors.questionId = "Question ID must be a string";
    } else if (!questionId) {
        errors.questionId = "Question ID is required";
    }

    if (typeof body.answer !== "string") {
        errors.answer = "Answer must be a string";
    } else if (!answerText) {
        errors.answer = "Answer is required";
    } else if (answerText.length < MIN_ANSWER_LENGTH) {
        errors.answer = `Answer must be at least ${MIN_ANSWER_LENGTH} characters`;
    } else if (answerText.length > MAX_ANSWER_LENGTH) {
        errors.answer = `Answer must not exceed ${MAX_ANSWER_LENGTH} characters`;
    }

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            message: "Validation failed",
            errors,
        });
    }

    try {
        const session = await InterviewPrepSession.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ message: "Interview preparation session not found" });
        }

        const status = getSessionStatus(session);

        if (status === "not_started") {
            return res.status(409).json({
                message: "Interview must be started before submitting answers",
            });
        }

        if (status === "completed") {
            return res.status(409).json({
                message: "Completed interviews cannot accept new answers",
            });
        }

        const questions = getSessionQuestions(session);
        const question = questions.find((item) => getQuestionId(item) === questionId);

        if (!question) {
            return res.status(404).json({ message: "Question not found in this session" });
        }

        if (!Array.isArray(session.answers)) {
            session.answers = [];
        }

        if (session.answers.some((answer) => answer.questionId === questionId)) {
            return res.status(409).json({
                message: "Answer for this question has already been submitted",
            });
        }

        const evaluation = evaluateInterviewAnswer({
            question: {
                questionId: getQuestionId(question),
                text: question.text,
                category: question.category,
                difficulty: question.difficulty,
                keyConcepts: Array.isArray(question.keyConcepts) ? question.keyConcepts : [],
                evaluationCriteria: Array.isArray(question.evaluationCriteria)
                    ? question.evaluationCriteria
                    : [],
            },
            answerText,
        });
        const answer = {
            questionId,
            answerText,
            submittedAt: new Date(),
            score: evaluation.score,
            strengths: evaluation.strengths,
            weaknesses: evaluation.weaknesses,
            missingConcepts: evaluation.missingConcepts,
            improvementSuggestions: evaluation.improvementSuggestions,
            evaluationProvider: evaluation.evaluationProvider,
            evaluationProviderType: evaluation.evaluationProviderType,
            evaluationFallbackUsed: evaluation.evaluationFallbackUsed,
            evaluationFallbackReason: evaluation.evaluationFallbackReason,
        };

        session.answers.push(answer);

        const answeredQuestionIds = new Set(session.answers.map((item) => item.questionId));
        const nextQuestionIndex = questions.findIndex((item) => (
            !answeredQuestionIds.has(getQuestionId(item))
        ));

        session.currentQuestionIndex = nextQuestionIndex === -1
            ? questions.length
            : nextQuestionIndex;
        await session.save();

        return res.status(200).json({
            answer: serializeAnswer(answer),
            progress: buildAnswerProgress(session),
        });
    } catch (error) {
        return handleControllerError(res, error, "Error submitting interview answer");
    }
};

const completeSession = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid session ID" });
    }

    try {
        const session = await InterviewPrepSession.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ message: "Interview preparation session not found" });
        }

        const status = getSessionStatus(session);

        if (status === "completed") {
            return res.status(409).json({ message: "Interview has already been completed" });
        }

        if (status === "not_started") {
            return res.status(409).json({
                message: "Interview must be started before it can be completed",
            });
        }

        const result = buildCompletionResult(session);

        session.status = "completed";
        session.completedAt = new Date();
        session.overallScore = result.overallScore;
        await session.save();

        return res.status(200).json({
            session: serializeSessionDetail(session),
            result,
        });
    } catch (error) {
        return handleControllerError(res, error, "Error completing interview preparation session");
    }
};

const listSessionHistory = async (req, res) => {
    try {
        const { page, limit, difficulty, search, sort } = parseHistoryQuery(req.query);
        const filter = { user: req.user.id };

        if (difficulty) {
            filter.difficulty = difficulty;
        }

        if (search) {
            const pattern = new RegExp(escapeRegExp(search), "i");
            filter.$or = [{ jobTitle: pattern }, { company: pattern }];
        }

        const sortOrder = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
        const skip = (page - 1) * limit;
        const [sessions, total] = await Promise.all([
            InterviewPrepSession.find(filter).sort(sortOrder).skip(skip).limit(limit),
            InterviewPrepSession.countDocuments(filter),
        ]);

        return res.status(200).json({
            sessions: sessions.map(serializeSessionSummary),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleControllerError(res, error, "Error fetching interview preparation history");
    }
};

const getSessionById = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid session ID" });
    }

    try {
        const session = await InterviewPrepSession.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ message: "Interview preparation session not found" });
        }

        return res.status(200).json({
            session: serializeSessionDetail(session),
        });
    } catch (error) {
        return handleControllerError(res, error, "Error fetching interview preparation session");
    }
};

const deleteSessionById = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid session ID" });
    }

    try {
        const session = await InterviewPrepSession.findOneAndDelete({
            _id: id,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ message: "Interview preparation session not found" });
        }

        return res.status(200).json({
            message: "Interview preparation session deleted successfully",
        });
    } catch (error) {
        return handleControllerError(res, error, "Error deleting interview preparation session");
    }
};

module.exports = {
    completeSession,
    deleteSessionById,
    generateSession,
    getSessionById,
    listSessionHistory,
    startSession,
    submitAnswer,
};
