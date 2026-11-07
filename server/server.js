const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const applicationRoutes = require("./routes/applicationRoutes");

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

app.get("/" , (req, res) => {
    res.send("Job Tracking API is running....");
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
