const express = require("express");
const router = express.Router();

const { analyzeMatch } = require("../controllers/matchingController");
const { protect } = require("../middleware/authMiddleware");

router.post("/analyze", protect, analyzeMatch);

module.exports = router;
