const express = require("express");
const router = express.Router();

const {
    analyzeMatch,
    deleteMatchingHistoryById,
    getMatchingHistoryById,
    listMatchingHistory,
} = require("../controllers/matchingController");
const { protect } = require("../middleware/authMiddleware");
const { sensitiveActionLimiter } = require("../middleware/rateLimiters");

router.post("/analyze", protect, sensitiveActionLimiter, analyzeMatch);
router.get("/history", protect, listMatchingHistory);
router.get("/history/:id", protect, getMatchingHistoryById);
router.delete("/history/:id", protect, deleteMatchingHistoryById);

module.exports = router;
