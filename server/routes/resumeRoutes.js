const express = require("express");
const router = express.Router();

const {
    activateResume,
    deleteResume,
    downloadResume,
    getResumeById,
    listResumes,
    uploadResume,
} = require("../controllers/resumeController");
const { protect } = require("../middleware/authMiddleware");
const { uploadResumeFile } = require("../middleware/resumeUploadMiddleware");

router.post("/", protect, uploadResumeFile, uploadResume);
router.get("/", protect, listResumes);
router.get("/:id/download", protect, downloadResume);
router.get("/:id", protect, getResumeById);
router.patch("/:id/activate", protect, activateResume);
router.delete("/:id", protect, deleteResume);

module.exports = router;
