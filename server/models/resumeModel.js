const mongoose = require("mongoose");

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const resumeSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            index: true,
        },
        originalName: {
            type: String,
            required: [true, "Original filename is required"],
            trim: true,
            maxlength: 255,
        },
        storedFilename: {
            type: String,
            required: [true, "Stored filename is required"],
            trim: true,
        },
        mimeType: {
            type: String,
            required: [true, "MIME type is required"],
            trim: true,
        },
        fileSize: {
            type: Number,
            required: [true, "File size is required"],
            min: [1, "File must not be empty"],
            max: [MAX_FILE_SIZE, "File must not exceed 5 MB"],
        },
        extractedText: {
            type: String,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        timestamps: true,
    },
);

resumeSchema.index({ user: 1, createdAt: -1 });
resumeSchema.index(
    { user: 1, isActive: 1 },
    { unique: true, partialFilterExpression: { isActive: true } },
);

resumeSchema.set("toJSON", {
    transform: (document, returnedObject) => {
        delete returnedObject.storedFilename;
        delete returnedObject.extractedText;
        delete returnedObject.__v;
        return returnedObject;
    },
});

module.exports = mongoose.model("Resume", resumeSchema);
module.exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
