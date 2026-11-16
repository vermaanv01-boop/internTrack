#!/usr/bin/env node

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const {
    AdminProvisioningError,
    provisionAdmin,
} = require("../services/adminBootstrap");
const logger = require("../utils/logger");

const USAGE = `Usage: npm run admin:create -- --name "Admin Name" --email admin@example.com [options]

Creates an active, email-verified admin account. Passwords are never accepted
as command-line arguments.

Options:
  --name <value>       Admin display name (required)
  --email <value>      Admin email address (required)
  --password-stdin     Read the password from standard input
  --update-existing    Update an existing admin with the same email
  --help, -h           Show this help

Without --password-stdin, the password is read from a hidden interactive prompt.
Examples:
  Get-Content .\\admin-password.txt | npm run admin:create -- --name "Admin" --email admin@example.com --password-stdin
  npm run admin:create -- --name "Admin" --email admin@example.com --update-existing`;

const requireValue = (argv, index, flag, inlineValue) => {
    if (inlineValue !== undefined) {
        if (inlineValue === "") {
            throw new Error(`${flag} requires a value`);
        }

        return { value: inlineValue, nextIndex: index };
    }

    const value = argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} requires a value`);
    }

    return { value, nextIndex: index + 1 };
};

const parseArgs = (argv = []) => {
    const options = {
        name: undefined,
        email: undefined,
        passwordStdin: false,
        updateExisting: false,
        help: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (!argument.startsWith("-")) {
            throw new Error(`Unexpected argument: ${argument}`);
        }

        if (argument === "--") {
            continue;
        }

        const equalsIndex = argument.indexOf("=");
        const flag = equalsIndex === -1
            ? argument
            : argument.slice(0, equalsIndex);
        const inlineValue = equalsIndex === -1
            ? undefined
            : argument.slice(equalsIndex + 1);

        if (flag === "--help" || flag === "-h") {
            if (inlineValue !== undefined) {
                throw new Error(`${flag} does not accept a value`);
            }

            options.help = true;
            continue;
        }

        if (flag === "--name" || flag === "--email") {
            const { value, nextIndex } = requireValue(
                argv,
                index,
                flag,
                inlineValue,
            );
            const key = flag === "--name" ? "name" : "email";

            options[key] = value;
            index = nextIndex;
            continue;
        }

        if (flag === "--password-stdin") {
            if (inlineValue !== undefined) {
                throw new Error("--password-stdin does not accept a value");
            }

            options.passwordStdin = true;
            continue;
        }

        if (flag === "--update-existing") {
            if (inlineValue !== undefined) {
                throw new Error("--update-existing does not accept a value");
            }

            options.updateExisting = true;
            continue;
        }

        if (flag === "--password") {
            throw new Error(
                "Passwords are not accepted as command-line arguments; use --password-stdin or the interactive prompt",
            );
        }

        throw new Error(`Unknown option: ${flag}`);
    }

    return options;
};

const readPasswordFromStdin = (input = process.stdin) =>
    new Promise((resolve, reject) => {
        let value = "";

        input.setEncoding("utf8");
        input.on("data", (chunk) => {
            value += chunk;
        });
        input.on("end", () => {
            resolve(value.replace(/\r?\n$/, ""));
        });
        input.on("error", reject);
        input.resume();
    });

const promptHidden = (label, input = process.stdin, output = process.stderr) =>
    new Promise((resolve, reject) => {
        if (
            !input.isTTY ||
            typeof input.setRawMode !== "function" ||
            typeof input.on !== "function"
        ) {
            const error = new Error(
                "Interactive password entry requires a TTY; use --password-stdin",
            );
            error.code = "TTY_REQUIRED";
            reject(error);
            return;
        }

        const wasRaw = input.isRaw;
        let value = "";

        const cleanup = () => {
            input.removeListener("data", onData);
            input.setRawMode(Boolean(wasRaw));
            input.pause();
            output.write("\n");
        };

        const onData = (chunk) => {
            for (const character of String(chunk)) {
                if (
                    character === "\r" ||
                    character === "\n" ||
                    character === "\u0004"
                ) {
                    cleanup();
                    resolve(value);
                    return;
                }

                if (character === "\u0003") {
                    cleanup();
                    const error = new Error("Password entry cancelled");
                    error.code = "CANCELLED";
                    reject(error);
                    return;
                }

                if (character === "\u007f" || character === "\b") {
                    value = value.slice(0, -1);
                    continue;
                }

                if (character >= " ") {
                    value += character;
                }
            }
        };

        output.write(label);
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });

const readPassword = async (options) => {
    if (options.passwordStdin) {
        return readPasswordFromStdin();
    }

    const password = await promptHidden("Admin password: ");

    if (!options.updateExisting) {
        const confirmation = await promptHidden("Confirm password: ");

        if (password !== confirmation) {
            throw new Error("Passwords do not match");
        }
    }

    return password;
};

const formatError = (error) => {
    if (error instanceof AdminProvisioningError && error.details) {
        const details = Object.entries(error.details)
            .map(([field, message]) => `${field}: ${message}`)
            .join("; ");

        return `${error.message} (${details})`;
    }

    if (error && error.message) {
        return logger.sanitize(error.message);
    }

    return "Unknown error";
};

const main = async (argv = process.argv.slice(2)) => {
    let options;

    try {
        options = parseArgs(argv);
    } catch (error) {
        process.stderr.write(`${formatError(error)}\n\n${USAGE}\n`);
        return 1;
    }

    if (options.help) {
        process.stdout.write(`${USAGE}\n`);
        return 0;
    }

    if (!options.name || !options.email) {
        process.stderr.write(`--name and --email are required\n\n${USAGE}\n`);
        return 1;
    }

    dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

    let password;

    try {
        password = await readPassword(options);
    } catch (error) {
        process.stderr.write(`Unable to read password: ${formatError(error)}\n`);
        return 1;
    }

    try {
        await connectDB();
        const result = await provisionAdmin({
            name: options.name,
            email: options.email,
            password,
            updateExisting: options.updateExisting,
            confirmExisting: options.updateExisting,
        });

        process.stdout.write(
            `${result.created ? "Created" : "Updated"} admin ${result.user.email} (${result.user._id})\n`,
        );
        return 0;
    } catch (error) {
        process.stderr.write(`Admin provisioning failed: ${formatError(error)}\n`);
        return 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
};

if (require.main === module) {
    main()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error) => {
            process.stderr.write(`Admin provisioning failed: ${formatError(error)}\n`);
            process.exitCode = 1;
        });
}

module.exports = {
    USAGE,
    formatError,
    main,
    parseArgs,
    promptHidden,
    readPasswordFromStdin,
};
