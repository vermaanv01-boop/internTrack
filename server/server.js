const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const resumeRoutes = require("./routes/resumeRoutes");
const matchingRoutes = require("./routes/matchingRoutes");
const interviewPrepRoutes = require("./routes/interviewPrepRoutes");
const healthRoutes = require("./routes/healthRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { requestLogger } = require("./middleware/requestLogger");
const logger = require("./utils/logger");

dotenv.config();

const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, "");

const createApp = () => {
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

    app.disable("x-powered-by");
    app.set("query parser", "simple");
    app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
    );
    app.use((req, res, next) => {
        const origin = req.headers.origin;

        if (origin && !isAllowedOrigin(origin)) {
            res.vary("Origin");
            return res.status(403).json({ message: "Origin not allowed by CORS" });
        }

        return corsMiddleware(req, res, next);
    });
    app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb", strict: true }));
    app.use(requestLogger);

    app.get("/", (req, res) => {
        res.send("Job Tracking API is running....");
    });

    app.use("/api/health", healthRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/applications", applicationRoutes);
    app.use("/api/analytics", analyticsRoutes);
    app.use("/api/resumes", resumeRoutes);
    app.use("/api/matching", matchingRoutes);
    app.use("/api/interview-prep", interviewPrepRoutes);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
};

const app = createApp();
const port = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();
    } catch (error) {
        logger.error("Failed to connect to the database during startup", { error });
        process.exit(1);
    }

    return app.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
    });
};

if (require.main === module) {
    startServer();
}

module.exports = { app, createApp, startServer };
