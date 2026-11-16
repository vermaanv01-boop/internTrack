const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_USER_FIELDS,
    buildMissingValueFilter,
    migrateUsers,
} = require("../migrations/001-add-user-role-foundation");

const createLog = () => ({
    infoCalls: [],
    errorCalls: [],
    info(message, meta) {
        this.infoCalls.push({ message, meta });
    },
    error(message, meta) {
        this.errorCalls.push({ message, meta });
    },
});

const matchesFilter = (document, filter) => {
    if (!filter || Object.keys(filter).length === 0) {
        return true;
    }

    return filter.$or.some((clause) => {
        const [field, condition] = Object.entries(clause)[0];

        if (
            condition
            && typeof condition === "object"
            && Object.prototype.hasOwnProperty.call(condition, "$exists")
        ) {
            return Object.prototype.hasOwnProperty.call(document, field)
                === condition.$exists;
        }

        return document[field] === condition;
    });
};

const createFakeUserModel = (documents, { failField = null } = {}) => {
    const calls = {
        count: [],
        update: [],
    };

    return {
        documents,
        calls,
        async countDocuments(filter = {}) {
            calls.count.push(filter);
            return documents.filter((document) => matchesFilter(document, filter)).length;
        },
        async updateMany(filter, update) {
            calls.update.push({ filter, update });
            const field = Object.keys(update.$set)[0];

            if (field === failField) {
                throw new Error(`Simulated update failure for ${field}`);
            }

            let matchedCount = 0;
            let modifiedCount = 0;

            for (const document of documents) {
                if (!matchesFilter(document, filter)) {
                    continue;
                }

                matchedCount += 1;

                for (const [key, value] of Object.entries(update.$set)) {
                    if (document[key] !== value) {
                        document[key] = value;
                        modifiedCount += 1;
                    }
                }
            }

            return { matchedCount, modifiedCount };
        },
    };
};

const createLegacyUsers = () => [
    {
        _id: "user-1",
        name: "Legacy User",
        email: "legacy@example.com",
        password: "legacy-hash",
    },
    {
        _id: "user-2",
        name: "Null Fields",
        email: "nulls@example.com",
        password: "hash-2",
        role: null,
        emailVerified: null,
        status: null,
    },
    {
        _id: "user-3",
        name: "Explicit HR",
        email: "hr@example.com",
        password: "hash-3",
        role: "hr",
        emailVerified: false,
        status: "suspended",
    },
    {
        _id: "user-4",
        name: "Explicit Admin",
        email: "admin@example.com",
        password: "hash-4",
        role: "admin",
    },
];

test("migration filters only target missing or null foundation fields", () => {
    assert.deepEqual(buildMissingValueFilter("role"), {
        $or: [{ role: { $exists: false } }, { role: null }],
    });
    assert.deepEqual(DEFAULT_USER_FIELDS, {
        role: "jobseeker",
        emailVerified: true,
        status: "active",
    });
});

test("migration applies defaults without overwriting explicit values", async () => {
    const documents = createLegacyUsers();
    const fakeUserModel = createFakeUserModel(documents);
    const log = createLog();

    const report = await migrateUsers({ UserModel: fakeUserModel, log });

    assert.equal(report.dryRun, false);
    assert.equal(report.scanned, 4);
    assert.equal(report.updated, 8);
    assert.equal(report.wouldUpdate, 8);
    assert.equal(report.failures.length, 0);
    assert.deepEqual(report.fields, {
        role: { matched: 2, updated: 2, failed: false },
        emailVerified: { matched: 3, updated: 3, failed: false },
        status: { matched: 3, updated: 3, failed: false },
    });
    assert.deepEqual(documents[0], {
        _id: "user-1",
        name: "Legacy User",
        email: "legacy@example.com",
        password: "legacy-hash",
        role: "jobseeker",
        emailVerified: true,
        status: "active",
    });
    assert.equal(documents[1].role, "jobseeker");
    assert.equal(documents[1].emailVerified, true);
    assert.equal(documents[1].status, "active");
    assert.equal(documents[2].role, "hr");
    assert.equal(documents[2].emailVerified, false);
    assert.equal(documents[2].status, "suspended");
    assert.equal(documents[3].role, "admin");
    assert.equal(documents[3].emailVerified, true);
    assert.equal(documents[3].status, "active");
    assert.equal(documents.length, 4);
    assert.equal(log.infoCalls.length, 1);
    assert.equal(log.infoCalls[0].meta.updated, 8);
});

test("migration dry-run reports changes without modifying data", async () => {
    const documents = createLegacyUsers();
    const before = JSON.parse(JSON.stringify(documents));
    const fakeUserModel = createFakeUserModel(documents);
    const log = createLog();

    const report = await migrateUsers({
        dryRun: true,
        UserModel: fakeUserModel,
        log,
    });

    assert.equal(report.dryRun, true);
    assert.equal(report.scanned, 4);
    assert.equal(report.updated, 0);
    assert.equal(report.wouldUpdate, 8);
    assert.equal(report.failures.length, 0);
    assert.deepEqual(documents, before);
    assert.equal(fakeUserModel.calls.update.length, 0);
});

test("migration is idempotent and preserves account identifiers and passwords", async () => {
    const documents = createLegacyUsers();
    const fakeUserModel = createFakeUserModel(documents);
    const log = createLog();

    const first = await migrateUsers({ UserModel: fakeUserModel, log });
    const firstSnapshot = JSON.parse(JSON.stringify(documents));
    const second = await migrateUsers({ UserModel: fakeUserModel, log });

    assert.equal(first.updated, 8);
    assert.equal(second.updated, 0);
    assert.equal(second.wouldUpdate, 0);
    assert.equal(second.failures.length, 0);
    assert.deepEqual(second.fields, {
        role: { matched: 0, updated: 0, failed: false },
        emailVerified: { matched: 0, updated: 0, failed: false },
        status: { matched: 0, updated: 0, failed: false },
    });
    assert.deepEqual(documents, firstSnapshot);
    assert.deepEqual(
        documents.map(({ _id, email, password }) => ({ _id, email, password })),
        [
            { _id: "user-1", email: "legacy@example.com", password: "legacy-hash" },
            { _id: "user-2", email: "nulls@example.com", password: "hash-2" },
            { _id: "user-3", email: "hr@example.com", password: "hash-3" },
            { _id: "user-4", email: "admin@example.com", password: "hash-4" },
        ],
    );
});

test("migration logs failures, continues remaining fields, and never deletes users", async () => {
    const documents = createLegacyUsers();
    const fakeUserModel = createFakeUserModel(documents, { failField: "role" });
    const log = createLog();

    const report = await migrateUsers({ UserModel: fakeUserModel, log });

    assert.equal(report.scanned, 4);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].field, "role");
    assert.equal(report.fields.role.failed, true);
    assert.equal(report.fields.emailVerified.updated, 3);
    assert.equal(report.fields.status.updated, 3);
    assert.equal(report.updated, 6);
    assert.equal(log.errorCalls.length, 1);
    assert.equal(log.infoCalls.length, 1);
    assert.equal(log.infoCalls[0].meta.failures, 1);
    assert.equal(documents.length, 4);
    assert.equal(documents[0].role, undefined);
    assert.equal(documents[0].emailVerified, true);
    assert.equal(documents[0].status, "active");
});
