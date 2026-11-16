const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("stream");

const {
    formatError,
    parseArgs,
    promptHidden,
    readPasswordFromStdin,
} = require("../scripts/createAdmin");
const {
    AdminProvisioningError,
} = require("../services/adminBootstrap");

test("parses admin CLI options in separated and equals forms", () => {
    assert.deepEqual(
        parseArgs([
            "--name",
            "Platform Admin",
            "--email=admin@example.com",
            "--password-stdin",
            "--update-existing",
        ]),
        {
            name: "Platform Admin",
            email: "admin@example.com",
            passwordStdin: true,
            updateExisting: true,
            help: false,
        },
    );

    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["-h"]).help, true);
});

test("rejects password arguments, unknown options, missing values, and positional arguments", () => {
    for (const argv of [
        ["--name", "Admin", "--email", "admin@example.com", "--password", "secret"],
        ["--unknown"],
        ["--name"],
        ["unexpected"],
    ]) {
        assert.throws(() => parseArgs(argv), /password|Unknown option|requires a value|Unexpected argument/);
    }
});

test("reads a password from stdin and strips one trailing newline", async () => {
    const input = new PassThrough();
    const passwordPromise = readPasswordFromStdin(input);

    input.end("s3cret-password\r\n");

    assert.equal(await passwordPromise, "s3cret-password");
});

test("hidden prompt fails closed when stdin is not a TTY", async () => {
    await assert.rejects(
        promptHidden("Password: ", new PassThrough(), new PassThrough()),
        (error) => {
            assert.equal(error.code, "TTY_REQUIRED");
            return true;
        },
    );
});

test("formats provisioning errors without exposing passwords", () => {
    const error = new AdminProvisioningError(
        "VALIDATION_ERROR",
        "Invalid admin account details",
        {
            password: "Password must be at least 8 characters",
        },
    );

    const formatted = formatError(error);

    assert.equal(
        formatted,
        "Invalid admin account details (password: Password must be at least 8 characters)",
    );
    assert.equal(formatted.includes("hunter2"), false);
});
