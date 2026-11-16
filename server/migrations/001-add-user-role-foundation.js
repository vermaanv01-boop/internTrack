const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/userModel");
const logger = require("../utils/logger");

const DEFAULT_USER_FIELDS = Object.freeze({
    role: "jobseeker",
    emailVerified: true,
    status: "active",
});

const buildMissingValueFilter = (field) => ({
    $or: [{ [field]: { $exists: false } }, { [field]: null }],
});

const getModifiedCount = (result, fallback = 0) => {
    if (!result) {
        return fallback;
    }

    if (Number.isFinite(result.modifiedCount)) {
        return result.modifiedCount;
    }

    if (Number.isFinite(result.nModified)) {
        return result.nModified;
    }

    return fallback;
};

const migrateUsers = async ({
    dryRun = false,
    UserModel = User,
    log = logger,
} = {}) => {
    const report = {
        dryRun: Boolean(dryRun),
        scanned: 0,
        updated: 0,
        wouldUpdate: 0,
        failures: [],
        fields: {},
    };

    try {
        report.scanned = await UserModel.countDocuments({});
    } catch (error) {
        report.failures.push({
            field: "scan",
            message: error && error.message ? error.message : String(error),
        });
        log.error("User role migration could not scan existing users", {
            error,
        });
    }

    for (const [field, defaultValue] of Object.entries(DEFAULT_USER_FIELDS)) {
        const filter = buildMissingValueFilter(field);
        let matched = 0;

        try {
            matched = await UserModel.countDocuments(filter);
        } catch (error) {
            report.fields[field] = { matched: 0, updated: 0, failed: true };
            report.failures.push({
                field,
                message: error && error.message ? error.message : String(error),
            });
            log.error("User role migration failed while counting a field", {
                field,
                error,
            });
            continue;
        }

        report.wouldUpdate += matched;

        if (dryRun || matched === 0) {
            report.fields[field] = { matched, updated: 0, failed: false };
            continue;
        }

        try {
            const result = await UserModel.updateMany(filter, {
                $set: { [field]: defaultValue },
            });
            const updated = getModifiedCount(result, matched);

            report.updated += updated;
            report.fields[field] = { matched, updated, failed: false };
        } catch (error) {
            report.fields[field] = { matched, updated: 0, failed: true };
            report.failures.push({
                field,
                message: error && error.message ? error.message : String(error),
            });
            log.error("User role migration failed while updating a field", {
                field,
                error,
            });
        }
    }

    log.info("User role migration summary", {
        dryRun: report.dryRun,
        scanned: report.scanned,
        updated: report.updated,
        wouldUpdate: report.wouldUpdate,
        failures: report.failures.length,
        fields: report.fields,
    });

    return report;
};

const run = async () => {
    const dryRun = process.argv.includes("--dry-run");

    try {
        await connectDB();
        const report = await migrateUsers({ dryRun });
        logger.info("User role migration finished", {
            dryRun: report.dryRun,
            scanned: report.scanned,
            updated: report.updated,
            wouldUpdate: report.wouldUpdate,
            failures: report.failures.length,
        });

        if (report.failures.length > 0) {
            process.exitCode = 1;
        }
    } catch (error) {
        logger.error("User role migration failed", { error });
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect().catch((error) => {
                logger.error("Failed to disconnect after user role migration", {
                    error,
                });
            });
        }
    }
};

if (require.main === module) {
    dotenv.config();
    run();
}

module.exports = {
    DEFAULT_USER_FIELDS,
    buildMissingValueFilter,
    migrateUsers,
};
