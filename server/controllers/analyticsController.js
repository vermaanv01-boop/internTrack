const mongoose = require("mongoose");
const Application = require("../models/applicationModel");
const logger = require("../utils/logger");

const APPLICATION_STATUSES = Application.schema.path("status").enumValues;
const PENDING_STATUSES = ["applied", "screening", "interview"];
const RESPONSE_STATUSES = ["screening", "interview", "offer", "rejected"];
const PROGRESSED_STATUSES = ["applied", "screening", "interview", "offer", "rejected"];
const TREND_MONTH_COUNT = 6;
const RECENT_APPLICATION_LIMIT = 5;

const toCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : 0;
};

const getMonthKey = (date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const getDateRanges = (now = new Date()) => {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const startOfMonth = new Date(Date.UTC(year, month, 1));
    const sixMonthsStart = new Date(
        Date.UTC(year, month - (TREND_MONTH_COUNT - 1), 1),
    );
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const startOfWeek = new Date(Date.UTC(year, month, day - daysSinceMonday));
    const months = [];

    for (let offset = TREND_MONTH_COUNT - 1; offset >= 0; offset -= 1) {
        months.push(getMonthKey(new Date(Date.UTC(year, month - offset, 1))));
    }

    return { startOfMonth, startOfWeek, sixMonthsStart, months };
};

const buildStatusCounts = (rows) => {
    const counts = Object.fromEntries(
        APPLICATION_STATUSES.map((status) => [status, 0]),
    );

    for (const row of Array.isArray(rows) ? rows : []) {
        if (row && APPLICATION_STATUSES.includes(row._id)) {
            counts[row._id] = toCount(row.count);
        }
    }

    return counts;
};

const sumStatuses = (counts, statuses) =>
    statuses.reduce((total, status) => total + counts[status], 0);

const calculateRate = (numerator, denominator) => {
    if (denominator <= 0) {
        return 0;
    }

    return Math.round((numerator / denominator) * 10000) / 10000;
};

const buildTrend = (rows, months) => {
    const counts = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        if (row && typeof row._id === "string") {
            counts.set(row._id, toCount(row.count));
        }
    }

    return months.map((month) => ({
        month,
        count: counts.get(month) || 0,
    }));
};

const getDashboardAnalytics = async (req, res) => {
    try {
        if (!req.user || !mongoose.isValidObjectId(req.user.id)) {
            return res.status(401).json({
                message: "Not authorized, invalid token payload",
            });
        }

        const userId = new mongoose.Types.ObjectId(req.user.id);
        const { startOfMonth, startOfWeek, sixMonthsStart, months } =
            getDateRanges();

        const aggregationResult = await Application.aggregate([
            {
                $match: {
                    user: userId,
                },
            },
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: null,
                                totalApplications: { $sum: 1 },
                                applicationsThisMonth: {
                                    $sum: {
                                        $cond: [
                                            { $gte: ["$createdAt", startOfMonth] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                applicationsThisWeek: {
                                    $sum: {
                                        $cond: [
                                            { $gte: ["$createdAt", startOfWeek] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                    pipeline: [
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    trend: [
                        {
                            $match: {
                                createdAt: { $gte: sixMonthsStart },
                            },
                        },
                        {
                            $group: {
                                _id: {
                                    $dateToString: {
                                        format: "%Y-%m",
                                        date: "$createdAt",
                                        timezone: "UTC",
                                    },
                                },
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    recent: [
                        {
                            $sort: {
                                createdAt: -1,
                                _id: -1,
                            },
                        },
                        {
                            $limit: RECENT_APPLICATION_LIMIT,
                        },
                        {
                            $project: {
                                _id: 0,
                                company: 1,
                                role: 1,
                                status: 1,
                                createdAt: 1,
                            },
                        },
                    ],
                },
            },
        ]);

        const facet =
            Array.isArray(aggregationResult) && aggregationResult[0]
                ? aggregationResult[0]
                : {};
        const overviewRow =
            Array.isArray(facet.overview) && facet.overview[0]
                ? facet.overview[0]
                : {};
        const pipeline = buildStatusCounts(facet.pipeline);
        const denominator = sumStatuses(pipeline, PROGRESSED_STATUSES);
        const responseCount = sumStatuses(pipeline, RESPONSE_STATUSES);

        return res.status(200).json({
            overview: {
                totalApplications: toCount(overviewRow.totalApplications),
                applicationsThisMonth: toCount(
                    overviewRow.applicationsThisMonth,
                ),
                applicationsThisWeek: toCount(
                    overviewRow.applicationsThisWeek,
                ),
                pendingApplications: sumStatuses(pipeline, PENDING_STATUSES),
                interviews: pipeline.interview,
                offers: pipeline.offer,
                rejections: pipeline.rejected,
            },
            pipeline,
            performance: {
                responseRate: calculateRate(responseCount, denominator),
                interviewRate: calculateRate(pipeline.interview, denominator),
                offerRate: calculateRate(pipeline.offer, denominator),
            },
            trend: buildTrend(facet.trend, months),
            recentApplications: Array.isArray(facet.recent) ? facet.recent : [],
        });
    } catch (error) {
        logger.error("Error fetching dashboard analytics", { error });
        return res.status(500).json({ message: "Server error" });
    }
};

module.exports = { getDashboardAnalytics };
