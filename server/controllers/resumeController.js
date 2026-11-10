const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");
const Resume = require("../models/resumeModel");
const {
    deleteStoredFile,
    resolveStoredFilePath,
    writeResumeFile,
    ResumeStorageError,
} = require("../config/resumeStorage");
const { validateAndExtractResume, ResumeValidationError } = require("../utils/resumeContent");
const logger = require("../utils/logger");

const serializeResume = (resume) => {
    const extractedText = typeof resume.extractedText === "string" ? resume.extractedText : "";

    return {
        _id: resume._id,
        originalName: resume.originalName,
        mimeType: resume.mimeType,
        fileSize: resume.fileSize,
        isActive: Boolean(resume.isActive),
        hasExtractedText: extractedText.trim().length > 0,
        textLength: extractedText.length,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
    };
};

const handleResumeError = (res, error, context) => {
    if (error instanceof ResumeValidationError) {
        return res.status(error.statusCode).json({ message: error.message });
    }

    if (error instanceof ResumeStorageError) {
        return res.status(error.statusCode).json({ message: error.message });
    }

    if (error && error.name === "ValidationError") {
        const errors = {};

        for (const [field, detail] of Object.entries(error.errors || {})) {
            errors[field] = detail.message;
        }

        return res.status(400).json({ message: "Validation failed", errors });
    }

    if (error && error.name === "CastError") {
        return res.status(400).json({ message: "Invalid resume ID" });
    }

    if (error && error.code === 11000) {
        return res.status(409).json({ message: "An active resume already exists for this user" });
    }

    logger.error(context, { error });
    return res.status(500).json({ message: "Server error" });
};

const findOwnedResume = (id, userId) => Resume.findOne({ _id: id, user: userId });

const uploadResume = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            message: "Resume file is required. Use the 'resume' field in multipart/form-data",
        });
    }

    try {
        const validated = await validateAndExtractResume({
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            fileSize: req.file.size,
        });

        const storedFilename = await writeResumeFile(req.file.buffer, validated.extension);

        try {
            const activeResume = await Resume.exists({ user: req.user.id, isActive: true });
            const resume = await Resume.create({
                user: req.user.id,
                originalName: validated.originalName,
                storedFilename,
                mimeType: validated.mimeType,
                fileSize: req.file.size,
                extractedText: validated.extractedText,
                isActive: !activeResume,
            });

            return res.status(201).json({
                message: "Resume uploaded successfully",
                resume: serializeResume(resume),
            });
        } catch (error) {
            await deleteStoredFile(storedFilename).catch((cleanupError) => {
                logger.error("Error cleaning up uploaded resume file", { error: cleanupError });
            });
            throw error;
        }
    } catch (error) {
        return handleResumeError(res, error, "Error uploading resume");
    }
};

const listResumes = async (req, res) => {
    try {
        const resumes = await Resume.find({ user: req.user.id }).sort({ createdAt: -1 });

        return res.status(200).json({
            resumes: resumes.map(serializeResume),
        });
    } catch (error) {
        return handleResumeError(res, error, "Error fetching resumes");
    }
};

const getResumeById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid resume ID" });
        }

        const resume = await findOwnedResume(id, req.user.id);

        if (!resume) {
            return res.status(404).json({ message: "Resume not found" });
        }

        return res.status(200).json({ resume: serializeResume(resume) });
    } catch (error) {
        return handleResumeError(res, error, "Error fetching resume");
    }
};

const buildContentDisposition = (originalName, extension) => {
    const fallback = `resume.${extension}`;
    const baseName = path.basename(
        typeof originalName === "string" && originalName.trim() ? originalName.trim() : fallback,
    );
    const sanitized = baseName.replace(/[\r\n"\\]/g, "_").slice(0, 255) || fallback;
    const asciiFallback = sanitized.replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(sanitized).replace(/['()]/g, (character) => (
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));

    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};

const downloadResume = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid resume ID" });
        }

        const resume = await findOwnedResume(id, req.user.id);

        if (!resume) {
            return res.status(404).json({ message: "Resume not found" });
        }

        let filePath;

        try {
            filePath = resolveStoredFilePath(resume.storedFilename);
        } catch (error) {
            return res.status(404).json({ message: "Resume file not found" });
        }

        let stats;

        try {
            stats = await fs.promises.stat(filePath);
        } catch (error) {
            return res.status(404).json({ message: "Resume file not found" });
        }

        if (!stats.isFile()) {
            return res.status(404).json({ message: "Resume file not found" });
        }

        const extension = resume.mimeType === "application/pdf" ? "pdf" : "docx";

        res.setHeader("Content-Type", resume.mimeType);
        res.setHeader("Content-Length", stats.size);
        res.setHeader("Content-Disposition", buildContentDisposition(resume.originalName, extension));
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, no-store");

        const stream = fs.createReadStream(filePath);

        stream.on("error", (error) => {
            logger.error("Error streaming resume file", { error });

            if (!res.headersSent) {
                return res.status(500).json({ message: "Server error" });
            }

            return res.destroy();
        });

        return stream.pipe(res);
    } catch (error) {
        return handleResumeError(res, error, "Error downloading resume");
    }
};

const activateResume = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid resume ID" });
        }

        const resume = await findOwnedResume(id, req.user.id);

        if (!resume) {
            return res.status(404).json({ message: "Resume not found" });
        }

        if (resume.isActive) {
            return res.status(200).json({
                message: "Resume is already active",
                resume: serializeResume(resume),
            });
        }

        await Resume.updateMany(
            { user: req.user.id, isActive: true, _id: { $ne: resume._id } },
            { $set: { isActive: false } },
        );

        const updatedResume = await Resume.findOneAndUpdate(
            { _id: resume._id, user: req.user.id },
            { $set: { isActive: true } },
            { new: true },
        );

        if (!updatedResume) {
            return res.status(404).json({ message: "Resume not found" });
        }

        return res.status(200).json({
            message: "Resume activated successfully",
            resume: serializeResume(updatedResume),
        });
    } catch (error) {
        return handleResumeError(res, error, "Error activating resume");
    }
};

const deleteResume = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid resume ID" });
        }

        const resume = await findOwnedResume(id, req.user.id);

        if (!resume) {
            return res.status(404).json({ message: "Resume not found" });
        }

        await deleteStoredFile(resume.storedFilename);

        const deletion = await Resume.deleteOne({ _id: resume._id, user: req.user.id });

        if (!deletion || deletion.deletedCount === 0) {
            return res.status(404).json({ message: "Resume not found" });
        }

        return res.status(200).json({ message: "Resume deleted successfully" });
    } catch (error) {
        return handleResumeError(res, error, "Error deleting resume");
    }
};

module.exports = {
    activateResume,
    deleteResume,
    downloadResume,
    getResumeById,
    listResumes,
    uploadResume,
};
