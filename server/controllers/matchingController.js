const mongoose = require("mongoose");
const Resume = require("../models/resumeModel");
const { analyzeResumeJob } = require("../services/matching");

const MIN_JOB_DESCRIPTION_LENGTH = 100;
const MAX_JOB_DESCRIPTION_LENGTH = 30000;

const findResume = async ({ resumeId, userId }) => {
    if (!resumeId) {
        return Resume.findOne({ user: userId, isActive: true });
    }

    return Resume.findOne({ _id: resumeId, user: userId });
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

        return res.status(200).json(analysis);
    } catch (error) {
        console.error("Error analyzing resume match", error);
        return res.status(500).json({ message: "Server error" });
    }
};

module.exports = { analyzeMatch };
