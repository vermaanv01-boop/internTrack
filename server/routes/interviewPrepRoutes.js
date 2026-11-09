const express = require("express");
const router = express.Router();

const {
    deleteSessionById,
    generateSession,
    getSessionById,
    listSessionHistory,
} = require("../controllers/interviewPrepController");
const { protect } = require("../middleware/authMiddleware");

router.post("/generate", protect, generateSession);
router.get("/history", protect, listSessionHistory);
router.get("/history/:id", protect, getSessionById);
router.delete("/history/:id", protect, deleteSessionById);

module.exports = router;
