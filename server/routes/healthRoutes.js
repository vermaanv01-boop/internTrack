const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const CONNECTION_STATES = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

const getDatabaseStatus = () =>
    CONNECTION_STATES[mongoose.connection.readyState] || "unknown";

router.get("/", (req, res) => {
    const databaseStatus = getDatabaseStatus();
    const healthy = databaseStatus === "connected";

    res.setHeader("Cache-Control", "no-store");
    return res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        database: {
            status: databaseStatus,
            connected: healthy,
        },
    });
});

module.exports = router;
