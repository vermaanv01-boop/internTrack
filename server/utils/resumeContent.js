const path = require("path");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 2_000_000;

const PDF_MIME_TYPE = "application/pdf";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

class ResumeValidationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "ResumeValidationError";
        this.statusCode = statusCode;
    }
}

const emptyDocumentError = (extension) => new ResumeValidationError(
    `Invalid or corrupted ${extension.toUpperCase()} document`,
);

const detectResumeType = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return null;
    }

    const header = buffer.subarray(0, 1024).toString("latin1");

    if (header.includes("%PDF-")) {
        return { extension: "pdf", mimeType: PDF_MIME_TYPE };
    }

    const isZip = buffer.length >= 4
        && buffer[0] === 0x50
        && buffer[1] === 0x4b
        && buffer[2] === 0x03
        && buffer[3] === 0x04;

    if (isZip) {
        const archiveListing = buffer.toString("latin1");
        const hasContentTypes = archiveListing.includes("[Content_Types].xml");
        const hasWordDocument = archiveListing.includes("word/document.xml");

        if (hasContentTypes && hasWordDocument) {
            if (archiveListing.includes("vbaProject.bin")) {
                throw new ResumeValidationError("Macro-enabled documents are not supported");
            }

            return { extension: "docx", mimeType: DOCX_MIME_TYPE };
        }
    }

    return null;
};

const normalizeExtractedText = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .replace(/\u0000/g, "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .slice(0, MAX_EXTRACTED_TEXT_LENGTH);
};

const extractPdfText = async (buffer) => {
    let parser;

    try {
        parser = new PDFParse({ data: buffer });
        const result = await parser.getText();

        if (!result || !Number.isFinite(result.total) || result.total < 1) {
            throw emptyDocumentError("pdf");
        }

        return normalizeExtractedText(result.text);
    } catch (error) {
        if (error instanceof ResumeValidationError) {
            throw error;
        }

        throw emptyDocumentError("pdf");
    } finally {
        if (parser) {
            await parser.destroy().catch(() => {});
        }
    }
};

const extractDocxText = async (buffer) => {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return normalizeExtractedText(result && result.value);
    } catch (error) {
        throw emptyDocumentError("docx");
    }
};

const validateOriginalName = (originalName, extension) => {
    if (typeof originalName !== "string" || !originalName.trim()) {
        throw new ResumeValidationError("Resume filename is required");
    }

    const safeName = path.basename(originalName.trim());
    const originalExtension = path.extname(safeName).toLowerCase();

    if (originalExtension !== `.${extension}`) {
        throw new ResumeValidationError("File content does not match the file extension");
    }

    return safeName
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/["\\]/g, "_")
        .slice(0, 255);
};

const validateAndExtractResume = async ({ buffer, originalName, fileSize }) => {
    const size = Number.isFinite(fileSize) ? fileSize : (Buffer.isBuffer(buffer) ? buffer.length : 0);

    if (size <= 0) {
        throw new ResumeValidationError("Resume file is empty");
    }

    if (size > MAX_FILE_SIZE) {
        throw new ResumeValidationError("File too large. Maximum size is 5 MB", 413);
    }

    if (!Buffer.isBuffer(buffer) || buffer.length !== size) {
        throw new ResumeValidationError("Resume upload is incomplete");
    }

    const detectedType = detectResumeType(buffer);

    if (!detectedType) {
        throw new ResumeValidationError("Unsupported file type. Only PDF and DOCX files are allowed");
    }

    const safeOriginalName = validateOriginalName(originalName, detectedType.extension);

    if (detectedType.extension === "pdf") {
        const extractedText = await extractPdfText(buffer);

        return {
            ...detectedType,
            originalName: safeOriginalName,
            extractedText,
        };
    }

    const extractedText = await extractDocxText(buffer);

    return {
        ...detectedType,
        originalName: safeOriginalName,
        extractedText,
    };
};

module.exports = {
    DOCX_MIME_TYPE,
    MAX_EXTRACTED_TEXT_LENGTH,
    MAX_FILE_SIZE,
    PDF_MIME_TYPE,
    ResumeValidationError,
    validateAndExtractResume,
};
