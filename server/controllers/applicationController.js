const mongoose = require("mongoose");
const Application = require("../models/applicationModel");
const logger = require("../utils/logger");

const EMPLOYMENT_TYPES = Application.schema.path("employmentType").enumValues;
const APPLICATION_STATUSES = Application.schema.path("status").enumValues;
const SORT_ORDERS = ["newest", "oldest"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

class RequestValidationError extends Error {
    constructor(errors, message = "Validation failed") {
        super(message);
        this.name = "RequestValidationError";
        this.errors = errors;
    }
}

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const ensureBodyObject = (body) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new RequestValidationError({
            body: "Request body must be a JSON object",
        });
    }
};

const parseRequiredString = (value, field, label, errors) => {
    if (value === undefined || value === null || value === "") {
        errors[field] = `${label} is required`;
        return undefined;
    }

    if (typeof value !== "string") {
        errors[field] = `${label} must be a string`;
        return undefined;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        errors[field] = `${label} is required`;
        return undefined;
    }

    return trimmed;
};

const parseOptionalString = (value, field, label, errors) => {
    if (value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        errors[field] = `${label} must be a string or null`;
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

const parseUrl = (value, field, label, errors) => {
    if (value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        errors[field] = `${label} must be a valid URL string or null`;
        return undefined;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    try {
        const parsed = new URL(trimmed);

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("Unsupported protocol");
        }
    } catch (error) {
        errors[field] = `${label} must be a valid http or https URL`;
        return undefined;
    }

    return trimmed;
};

const parseEnum = (value, field, label, allowedValues, errors) => {
    if (value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        errors[field] = `${label} must be a string`;
        return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    if (!allowedValues.includes(normalized)) {
        errors[field] = `${label} must be one of: ${allowedValues.join(", ")}`;
        return undefined;
    }

    return normalized;
};

const parseDate = (value, field, label, errors) => {
    if (value === null || value === "") {
        return null;
    }

    if (typeof value !== "string" && !(value instanceof Date)) {
        errors[field] = `${label} must be a valid date string or null`;
        return undefined;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        errors[field] = `${label} must be a valid date`;
        return undefined;
    }

    return date;
};

const parseCreatePayload = (body) => {
    ensureBodyObject(body);

    const errors = {};
    const data = {};

    if (hasOwn(body, "company")) {
        const company = parseRequiredString(body.company, "company", "Company", errors);

        if (company !== undefined) {
            data.company = company;
        }
    } else {
        errors.company = "Company is required";
    }

    if (hasOwn(body, "role")) {
        const role = parseRequiredString(body.role, "role", "Role", errors);

        if (role !== undefined) {
            data.role = role;
        }
    } else {
        errors.role = "Role is required";
    }

    if (hasOwn(body, "jobUrl")) {
        const jobUrl = parseUrl(body.jobUrl, "jobUrl", "Job URL", errors);

        if (jobUrl !== undefined && jobUrl !== null) {
            data.jobUrl = jobUrl;
        }
    }

    for (const [field, label] of [
        ["location", "Location"],
        ["salary", "Salary"],
        ["notes", "Notes"],
        ["description", "Description"],
    ]) {
        if (hasOwn(body, field)) {
            const value = parseOptionalString(body[field], field, label, errors);

            if (value !== undefined && value !== null) {
                data[field] = value;
            }
        }
    }

    if (hasOwn(body, "employmentType")) {
        const employmentType = parseEnum(
            body.employmentType,
            "employmentType",
            "Employment type",
            EMPLOYMENT_TYPES,
            errors,
        );

        if (employmentType !== undefined && employmentType !== null) {
            data.employmentType = employmentType;
        }
    }

    if (hasOwn(body, "status")) {
        const status = parseEnum(
            body.status,
            "status",
            "Status",
            APPLICATION_STATUSES,
            errors,
        );

        if (status === null) {
            errors.status = "Status is required";
        } else if (status !== undefined) {
            data.status = status;
        }
    }

    for (const [field, label] of [
        ["appliedAt", "Applied date"],
        ["deadline", "Deadline"],
    ]) {
        if (hasOwn(body, field)) {
            const value = parseDate(body[field], field, label, errors);

            if (value !== undefined && value !== null) {
                data[field] = value;
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new RequestValidationError(errors);
    }

    return data;
};

const parseUpdatePayload = (body) => {
    ensureBodyObject(body);

    const errors = {};
    const data = {};

    for (const [field, label] of [
        ["company", "Company"],
        ["role", "Role"],
    ]) {
        if (hasOwn(body, field)) {
            const value = parseRequiredString(body[field], field, label, errors);

            if (value !== undefined) {
                data[field] = value;
            }
        }
    }

    if (hasOwn(body, "jobUrl")) {
        const jobUrl = parseUrl(body.jobUrl, "jobUrl", "Job URL", errors);

        if (jobUrl !== undefined) {
            data.jobUrl = jobUrl;
        }
    }

    for (const [field, label] of [
        ["location", "Location"],
        ["salary", "Salary"],
        ["notes", "Notes"],
        ["description", "Description"],
    ]) {
        if (hasOwn(body, field)) {
            const value = parseOptionalString(body[field], field, label, errors);

            if (value !== undefined) {
                data[field] = value;
            }
        }
    }

    if (hasOwn(body, "employmentType")) {
        const employmentType = parseEnum(
            body.employmentType,
            "employmentType",
            "Employment type",
            EMPLOYMENT_TYPES,
            errors,
        );

        if (employmentType !== undefined) {
            data.employmentType = employmentType;
        }
    }

    if (hasOwn(body, "status")) {
        const status = parseEnum(
            body.status,
            "status",
            "Status",
            APPLICATION_STATUSES,
            errors,
        );

        if (status === null) {
            errors.status = "Status is required";
        } else if (status !== undefined) {
            data.status = status;
        }
    }

    for (const [field, label] of [
        ["appliedAt", "Applied date"],
        ["deadline", "Deadline"],
    ]) {
        if (hasOwn(body, field)) {
            const value = parseDate(body[field], field, label, errors);

            if (value !== undefined) {
                data[field] = value;
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new RequestValidationError(errors);
    }

    if (Object.keys(data).length === 0) {
        throw new RequestValidationError({
            body: "Provide at least one valid field to update",
        });
    }

    return data;
};

const parsePositiveInteger = (value, field, fallback, maximum, errors) => {
    if (value === undefined) {
        return fallback;
    }

    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        errors[field] = `${field} must be a positive integer`;
        return fallback;
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        errors[field] = `${field} must be a positive integer`;
        return fallback;
    }

    if (maximum !== null && parsed > maximum) {
        errors[field] = `${field} must not exceed ${maximum}`;
        return fallback;
    }

    return parsed;
};

const parseListQuery = (query) => {
    const errors = {};

    const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE, null, errors);
    const limit = parsePositiveInteger(
        query.limit,
        "limit",
        DEFAULT_LIMIT,
        MAX_LIMIT,
        errors,
    );

    let status;

    if (query.status !== undefined) {
        if (typeof query.status !== "string" || !query.status.trim()) {
            errors.status = "status must be a valid status";
        } else {
            status = query.status.trim().toLowerCase();

            if (!APPLICATION_STATUSES.includes(status)) {
                errors.status = `status must be one of: ${APPLICATION_STATUSES.join(", ")}`;
            }
        }
    }

    let search;

    if (query.search !== undefined) {
        if (typeof query.search !== "string") {
            errors.search = "search must be a string";
        } else {
            search = query.search.trim() || undefined;
        }
    }

    let sort = "newest";

    if (query.sort !== undefined) {
        if (typeof query.sort !== "string") {
            errors.sort = "sort must be newest or oldest";
        } else {
            sort = query.sort.trim().toLowerCase();

            if (!SORT_ORDERS.includes(sort)) {
                errors.sort = "sort must be newest or oldest";
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new RequestValidationError(errors);
    }

    return { page, limit, status, search, sort };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatMongooseValidationError = (error) => {
    const errors = {};

    for (const [field, detail] of Object.entries(error.errors || {})) {
        errors[field] = detail.message;
    }

    return errors;
};

const handleControllerError = (res, error, context) => {
    if (error instanceof RequestValidationError) {
        return res.status(400).json({
            message: error.message,
            errors: error.errors,
        });
    }

    if (error && error.name === "ValidationError") {
        return res.status(400).json({
            message: "Validation failed",
            errors: formatMongooseValidationError(error),
        });
    }

    if (error && error.name === "CastError") {
        return res.status(400).json({ message: "Invalid application ID" });
    }

    logger.error(context, { error });
    return res.status(500).json({ message: "Server error" });
};

const createApplication = async (req, res) => {
    try {
        const data = parseCreatePayload(req.body);
        const application = await Application.create({
            ...data,
            user: req.user.id,
        });

        return res.status(201).json({
            message: "Application created successfully",
            application,
        });
    } catch (error) {
        return handleControllerError(res, error, "Error creating application");
    }
};

const getApplications = async (req, res) => {
    try {
        const { page, limit, status, search, sort } = parseListQuery(req.query);
        const filter = { user: req.user.id };

        if (status) {
            filter.status = status;
        }

        if (search) {
            const pattern = new RegExp(escapeRegExp(search), "i");
            filter.$or = [{ company: pattern }, { role: pattern }];
        }

        const sortOrder = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
        const skip = (page - 1) * limit;
        const [applications, total] = await Promise.all([
            Application.find(filter).sort(sortOrder).skip(skip).limit(limit),
            Application.countDocuments(filter),
        ]);

        return res.status(200).json({
            applications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleControllerError(res, error, "Error fetching applications");
    }
};

const getApplicationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid application ID" });
        }

        const application = await Application.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!application) {
            return res.status(404).json({ message: "Application not found" });
        }

        return res.status(200).json({ application });
    } catch (error) {
        return handleControllerError(res, error, "Error fetching application");
    }
};

const updateApplication = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid application ID" });
        }

        const data = parseUpdatePayload(req.body);
        const application = await Application.findOneAndUpdate(
            { _id: id, user: req.user.id },
            data,
            { new: true, runValidators: true },
        );

        if (!application) {
            return res.status(404).json({ message: "Application not found" });
        }

        return res.status(200).json({
            message: "Application updated successfully",
            application,
        });
    } catch (error) {
        return handleControllerError(res, error, "Error updating application");
    }
};

const deleteApplication = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid application ID" });
        }

        const application = await Application.findOneAndDelete({
            _id: id,
            user: req.user.id,
        });

        if (!application) {
            return res.status(404).json({ message: "Application not found" });
        }

        return res.status(200).json({
            message: "Application deleted successfully",
        });
    } catch (error) {
        return handleControllerError(res, error, "Error deleting application");
    }
};

module.exports = {
    createApplication,
    getApplications,
    getApplicationById,
    updateApplication,
    deleteApplication,
};
