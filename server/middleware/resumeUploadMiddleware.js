const multer = require("multer");
const { MAX_FILE_SIZE } = require("../utils/resumeContent");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
        fields: 10,
        parts: 20,
    },
});

const mapMulterError = (error) => {
    if (error.code === "LIMIT_FILE_SIZE") {
        return { statusCode: 413, message: "File too large. Maximum size is 5 MB" };
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return { statusCode: 400, message: "Unexpected file field. Use the 'resume' field" };
    }

    if (error.code === "LIMIT_FILE_COUNT") {
        return { statusCode: 400, message: "Only one resume file can be uploaded at a time" };
    }

    if (error.code === "LIMIT_PART_COUNT" || error.code === "LIMIT_FIELD_COUNT") {
        return { statusCode: 400, message: "Upload request has too many parts or fields" };
    }

    return { statusCode: 400, message: "Invalid resume upload request" };
};

const uploadResumeFile = (req, res, next) => {
    upload.single("resume")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            const { statusCode, message } = mapMulterError(error);
            return res.status(statusCode).json({ message });
        }

        console.error("Error processing resume upload", error);
        return res.status(400).json({ message: "Invalid resume upload request" });
    });
};

module.exports = { uploadResumeFile };
