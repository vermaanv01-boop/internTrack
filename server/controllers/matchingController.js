const mongoose = require("mongoose");
const MatchingAnalysis = require("../models/matchingAnalysisModel");
const Resume = require("../models/resumeModel");
const { analyzeResumeJob } = require("../services/matching");
const logger = require("../utils/logger");

const MIN_JOB_DESCRIPTION_LENGTH = 100;
const MAX_JOB_DESCRIPTION_LENGTH = 30000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SORT_ORDERS = ["newest", "oldest"];

class RequestValidationError extends Error {
    constructor(errors, message = "Validation failed") {
        super(message);
        this.name = "RequestValidationError";
        this.errors = errors;
    }
}

const findResume = async ({ resumeId, userId }) => {
    if (!resumeId) {
        return Resume.findOne({ user: userId, isActive: true });
    }

    return Resume.findOne({ _id: resumeId, user: userId });
};

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

const buildSnapshot = ({ userId, resumeId, jobDescription, jobTitle, company, analysis }) => ({
    user: userId,
    resume: resumeId,
    jobDescription,
    jobTitle: jobTitle === undefined ? null : jobTitle,
    company: company === undefined ? null : company,
    matchScore: analysis.matchScore,
    scoreLabel: analysis.matchLabel,
    matchedSkills: cloneSnapshot(analysis.matchedSkills || []),
    missingSkills: cloneSnapshot(analysis.missingSkills || []),
    partialMatches: cloneSnapshot(analysis.relatedSkills || []),
    experienceAlignment: cloneSnapshot(analysis.experienceAnalysis || {}),
    educationAlignment: cloneSnapshot(analysis.educationAnalysis || {}),
    matchedKeywords: cloneSnapshot(analysis.keywordAnalysis?.matchedKeywords || []),
    missingKeywords: cloneSnapshot(analysis.keywordAnalysis?.missingKeywords || []),
    totalKeywords: analysis.keywordAnalysis?.totalKeywords || 0,
    keywordCoverage: analysis.keywordAnalysis?.coverage || 0,
    strengths: cloneSnapshot(analysis.strengths || []),
    improvements: cloneSnapshot(analysis.improvements || []),
    scoreBreakdown: cloneSnapshot(analysis.scoreBreakdown || {}),
    summary: analysis.summary || null,
    provider: analysis.provider || null,
    disclaimer: analysis.disclaimer || null,
});

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

const parseScore = (value, field, errors) => {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string" || !value.trim()) {
        errors[field] = `${field} must be a number between 0 and 100`;
        return undefined;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        errors[field] = `${field} must be a number between 0 and 100`;
        return undefined;
    }

    return parsed;
};

const parseHistoryQuery = (query) => {
    const errors = {};
    const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE, null, errors);
    const limit = parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT, MAX_LIMIT, errors);
    const minScore = parseScore(query.minScore, "minScore", errors);
    const maxScore = parseScore(query.maxScore, "maxScore", errors);

    if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) {
        errors.scoreRange = "minScore must be less than or equal to maxScore";
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

    return { page, limit, minScore, maxScore, search, sort };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPlainObject = (document) => (
    document && typeof document.toObject === "function" ? document.toObject() : document
);

const serializeAnalysisSummary = (analysis) => {
    const raw = toPlainObject(analysis);
    const matchedSkills = Array.isArray(raw.matchedSkills) ? raw.matchedSkills : [];
    const missingSkills = Array.isArray(raw.missingSkills) ? raw.missingSkills : [];
    const partialMatches = Array.isArray(raw.partialMatches) ? raw.partialMatches : [];
    const missingKeywords = Array.isArray(raw.missingKeywords) ? raw.missingKeywords : [];

    return {
        id: raw._id ? String(raw._id) : null,
        _id: raw._id,
        resume: raw.resume,
        resumeId: raw.resume ? String(raw.resume) : null,
        jobTitle: raw.jobTitle || null,
        company: raw.company || null,
        matchScore: raw.matchScore,
        scoreLabel: raw.scoreLabel,
        matchedSkillsCount: matchedSkills.length,
        missingSkillsCount: missingSkills.length,
        partialMatchesCount: partialMatches.length,
        missingKeywordsCount: missingKeywords.length,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
};

const serializeAnalysisDetail = (analysis) => {
    const raw = toPlainObject(analysis);
    const matchedSkills = Array.isArray(raw.matchedSkills) ? raw.matchedSkills : [];
    const missingSkills = Array.isArray(raw.missingSkills) ? raw.missingSkills : [];
    const partialMatches = Array.isArray(raw.partialMatches) ? raw.partialMatches : [];
    const matchedKeywords = Array.isArray(raw.matchedKeywords) ? raw.matchedKeywords : [];
    const missingKeywords = Array.isArray(raw.missingKeywords) ? raw.missingKeywords : [];
    const experienceAlignment = raw.experienceAlignment || {};
    const educationAlignment = raw.educationAlignment || {};

    return {
        id: raw._id ? String(raw._id) : null,
        _id: raw._id,
        user: raw.user,
        resume: raw.resume,
        resumeId: raw.resume ? String(raw.resume) : null,
        jobDescription: raw.jobDescription,
        jobTitle: raw.jobTitle || null,
        company: raw.company || null,
        matchScore: raw.matchScore,
        scoreLabel: raw.scoreLabel,
        matchLabel: raw.scoreLabel,
        matchedSkills,
        missingSkills,
        partialMatches,
        relatedSkills: partialMatches,
        experienceAlignment,
        experienceAnalysis: experienceAlignment,
        educationAlignment,
        educationAnalysis: educationAlignment,
        matchedKeywords,
        missingKeywords,
        keywordAnalysis: {
            matchedKeywords,
            missingKeywords,
            totalKeywords: raw.totalKeywords || 0,
            coverage: raw.keywordCoverage || 0,
        },
        strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
        improvements: Array.isArray(raw.improvements) ? raw.improvements : [],
        scoreBreakdown: raw.scoreBreakdown || {},
        summary: raw.summary || null,
        provider: raw.provider || null,
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

    logger.error(context, { error });
    return res.status(500).json({ message: "Server error" });
};

const analyzeMatch = async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobDescription = typeof body.jobDescription === "string"
        ? body.jobDescription.trim()
        : "";

    if (!jobDescription) {
        return res.status(400).json({ message: "Job description is required" });
    }

    if (jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
        return res.status(400).json({
            message: `Job description must be at least ${MIN_JOB_DESCRIPTION_LENGTH} characters`,
        });
    }

    if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
        return res.status(400).json({
            message: `Job description must not exceed ${MAX_JOB_DESCRIPTION_LENGTH} characters`,
        });
    }

    const jobTitleField = parseOptionalMetadata(body.jobTitle);
    const companyField = parseOptionalMetadata(body.company);
    const metadataErrors = {};

    if (!jobTitleField.valid) {
        metadataErrors.jobTitle = "Job title must be a string";
    }

    if (!companyField.valid) {
        metadataErrors.company = "Company must be a string";
    }

    if (Object.keys(metadataErrors).length > 0) {
        return res.status(400).json({
            message: "Validation failed",
            errors: metadataErrors,
        });
    }

    const hasResumeId = body.resumeId !== undefined && body.resumeId !== null && body.resumeId !== "";

    if (hasResumeId && (typeof body.resumeId !== "string" || !mongoose.isValidObjectId(body.resumeId))) {
        return res.status(400).json({ message: "Invalid resume ID" });
    }

    try {
        const resume = await findResume({
            resumeId: hasResumeId ? body.resumeId : null,
            userId: req.user.id,
        });

        if (!resume) {
            return res.status(404).json({
                message: hasResumeId
                    ? "Resume not found"
                    : "No active resume found. Upload or activate a resume first.",
            });
        }

        const extractedText = typeof resume.extractedText === "string"
            ? resume.extractedText.trim()
            : "";

        if (!extractedText) {
            return res.status(400).json({
                message: "Resume does not contain usable extracted text",
            });
        }

        const analysis = analyzeResumeJob(extractedText, jobDescription);
        const savedAnalysis = await MatchingAnalysis.create(buildSnapshot({
            userId: req.user.id,
            resumeId: resume._id || resume.id || (hasResumeId ? body.resumeId : undefined),
            jobDescription,
            jobTitle: jobTitleField.value,
            company: companyField.value,
            analysis,
        }));
        const analysisId = savedAnalysis && savedAnalysis._id
            ? String(savedAnalysis._id)
            : null;

        return res.status(200).json({
            ...analysis,
            analysisId,
            id: analysisId,
            jobTitle: savedAnalysis?.jobTitle ?? jobTitleField.value ?? null,
            company: savedAnalysis?.company ?? companyField.value ?? null,
        });
    } catch (error) {
        return handleControllerError(res, error, "Error analyzing resume match");
    }
};

const listMatchingHistory = async (req, res) => {
    try {
        const { page, limit, minScore, maxScore, search, sort } = parseHistoryQuery(req.query);
        const filter = { user: req.user.id };

        if (search) {
            const pattern = new RegExp(escapeRegExp(search), "i");
            filter.$or = [{ jobTitle: pattern }, { company: pattern }];
        }

        if (minScore !== undefined || maxScore !== undefined) {
            filter.matchScore = {};

            if (minScore !== undefined) {
                filter.matchScore.$gte = minScore;
            }

            if (maxScore !== undefined) {
                filter.matchScore.$lte = maxScore;
            }
        }

        const sortOrder = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
        const skip = (page - 1) * limit;
        const [analyses, total] = await Promise.all([
            MatchingAnalysis.find(filter).sort(sortOrder).skip(skip).limit(limit),
            MatchingAnalysis.countDocuments(filter),
        ]);

        return res.status(200).json({
            analyses: analyses.map(serializeAnalysisSummary),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleControllerError(res, error, "Error fetching matching history");
    }
};

const getMatchingHistoryById = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid analysis ID" });
    }

    try {
        const analysis = await MatchingAnalysis.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!analysis) {
            return res.status(404).json({ message: "Analysis not found" });
        }

        return res.status(200).json({
            analysis: serializeAnalysisDetail(analysis),
        });
    } catch (error) {
        return handleControllerError(res, error, "Error fetching matching analysis");
    }
};

const deleteMatchingHistoryById = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid analysis ID" });
    }

    try {
        const analysis = await MatchingAnalysis.findOneAndDelete({
            _id: id,
            user: req.user.id,
        });

        if (!analysis) {
            return res.status(404).json({ message: "Analysis not found" });
        }

        return res.status(200).json({
            message: "Matching analysis deleted successfully",
        });
    } catch (error) {
        return handleControllerError(res, error, "Error deleting matching analysis");
    }
};

module.exports = {
    analyzeMatch,
    deleteMatchingHistoryById,
    getMatchingHistoryById,
    listMatchingHistory,
};
