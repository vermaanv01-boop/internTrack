const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const resumeRoutes = require("./routes/resumeRoutes");
const matchingRoutes = require("./routes/matchingRoutes");
const interviewPrepRoutes = require("./routes/interviewPrepRoutes");

dotenv.config();

const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, "");
const allowedOrigins = new Set(
    (process.env.CLIENT_URL || "")
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean),
);
const isAllowedOrigin = (origin) => allowedOrigins.has(normalizeOrigin(origin));

const corsOptions = {
    origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    optionsSuccessStatus: 204,
};
const corsMiddleware = cors(corsOptions);

const app = express();
app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && !isAllowedOrigin(origin)) {
        res.vary("Origin");
        return res.status(403).json({ message: "Origin not allowed by CORS" });
    }

    return corsMiddleware(req, res, next);
});
app.use(express.json());
app.use("/api/users", userRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/matching", matchingRoutes);
app.use("/api/interview-prep", interviewPrepRoutes);

app.get("/" , (req, res) => {
    res.send("Job Tracking API is running....");
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Invalid JSON payload" });
    }

    console.error("Unhandled server error", error);
    return res.status(500).json({ message: "Server error" });
});

const port = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();
    } catch (error) {
        process.exit(1);
    }

    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};

startServer();
