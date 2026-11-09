const mongoose = require("mongoose");
const InterviewPrepSession = require("../models/interviewPrepSessionModel");
const Resume = require("../models/resumeModel");
const { generateInterviewQuestions } = require("../services/interviewPrep");
const { DIFFICULTIES } = require("../services/interviewPrep/constants");

const MIN_JOB_DESCRIPTION_LENGTH = 100;
const MAX_JOB_DESCRIPTION_LENGTH = 30000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SORT_ORDERS = ["newest", "oldest"];
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

const serializeSessionSummary = (session) => {
    const raw = toPlainObject(session);

    return {
        id: raw._id ? String(raw._id) : null,
        _id: raw._id,
        resume: raw.resume,
        resumeId: raw.resume ? String(raw.resume) : null,
        jobTitle: raw.jobTitle || null,
        company: raw.company || null,
        difficulty: raw.difficulty,
        questionCount: raw.questionCount || 0,
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
        questions: Array.isArray(raw.questions) ? raw.questions.map(serializeQuestion) : [],
        categoriesCovered: Array.isArray(raw.categoriesCovered) ? raw.categoriesCovered : [],
        questionCount: raw.questionCount || 0,
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
    deleteSessionById,
    generateSession,
    getSessionById,
    listSessionHistory,
};
