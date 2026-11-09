const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_UPLOAD_DIR = path.join(__dirname, "..", "storage", "resumes");
const STORED_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$/i;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx"]);

class ResumeStorageError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = "ResumeStorageError";
        this.statusCode = statusCode;
    }
}

const getUploadDir = () => {
    const configured = typeof process.env.RESUME_UPLOAD_DIR === "string"
        ? process.env.RESUME_UPLOAD_DIR.trim()
        : "";

    return path.resolve(configured || DEFAULT_UPLOAD_DIR);
};

const ensureUploadDir = async () => {
    const uploadDir = getUploadDir();
    await fs.promises.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    return uploadDir;
};

const isAllowedExtension = (extension) => ALLOWED_EXTENSIONS.has(String(extension).toLowerCase());

const buildStoredFilename = (extension) => {
    const normalizedExtension = String(extension).toLowerCase();

    if (!isAllowedExtension(normalizedExtension)) {
        throw new ResumeStorageError("Unsupported resume file type", 400);
    }

    return `${crypto.randomUUID()}.${normalizedExtension}`;
};

const resolveStoredFilePath = (storedFilename) => {
    if (typeof storedFilename !== "string" || !STORED_FILENAME_PATTERN.test(storedFilename)) {
        throw new ResumeStorageError("Resume file not found", 404);
    }

    const uploadDir = getUploadDir();
    const filePath = path.resolve(uploadDir, storedFilename);

    if (path.dirname(filePath) !== uploadDir || path.basename(filePath) !== storedFilename) {
        throw new ResumeStorageError("Resume file not found", 404);
    }

    return filePath;
};

const writeResumeFile = async (buffer, extension) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new ResumeStorageError("Resume file is empty", 400);
    }

    const uploadDir = await ensureUploadDir();
    const storedFilename = buildStoredFilename(extension);
    const filePath = path.join(uploadDir, storedFilename);

    try {
        await fs.promises.writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
    } catch (error) {
        if (error && error.code === "EEXIST") {
            return writeResumeFile(buffer, extension);
        }

        throw error;
    }

    return storedFilename;
};

const deleteStoredFile = async (storedFilename) => {
    let filePath;

    try {
        filePath = resolveStoredFilePath(storedFilename);
    } catch (error) {
        if (error instanceof ResumeStorageError && error.statusCode === 404) {
            return false;
        }

        throw error;
    }

    try {
        await fs.promises.unlink(filePath);
        return true;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return false;
        }

        throw error;
    }
};

module.exports = {
    DEFAULT_UPLOAD_DIR,
    ResumeStorageError,
    buildStoredFilename,
    deleteStoredFile,
    ensureUploadDir,
    getUploadDir,
    resolveStoredFilePath,
    writeResumeFile,
};
