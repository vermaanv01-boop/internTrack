const express = require("express");
const router = express.Router();

const {
    completeSession,
    deleteSessionById,
    generateSession,
    getSessionById,
    listSessionHistory,
    startSession,
    submitAnswer,
} = require("../controllers/interviewPrepController");
const { protect } = require("../middleware/authMiddleware");

router.post("/generate", protect, generateSession);
router.post("/:id/start", protect, startSession);
router.post("/:id/answer", protect, submitAnswer);
router.post("/:id/complete", protect, completeSession);
router.get("/history", protect, listSessionHistory);
router.get("/history/:id", protect, getSessionById);
router.delete("/history/:id", protect, deleteSessionById);

module.exports = router;
