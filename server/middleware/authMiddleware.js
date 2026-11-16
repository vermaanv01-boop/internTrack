const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const User = require("../models/userModel");
const Company = require("../models/companyModel");
const CompanyMember = require("../models/companyMemberModel");

const JWT_ALGORITHM = "HS256";
const ACTIVE_STATUS = "active";

const unauthorized = (res, message) => res.status(401).json({ message });
const forbidden = (res, message) => res.status(403).json({ message });

const parseBearerToken = (authHeader) => {
  if (!authHeader || typeof authHeader !== "string") {
    return { error: "Not authorized, no token provided" };
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
    return { error: "Not authorized, invalid authorization header" };
  }

  return { token: parts[1] };
};

const verifyToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  });

  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.id !== "string" ||
    decoded.id.trim() === "" ||
    !mongoose.isValidObjectId(decoded.id)
  ) {
    const error = new Error("invalid token payload");
    error.code = "INVALID_TOKEN_PAYLOAD";
    throw error;
  }

  return decoded;
};

const protect = async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    logger.error("JWT_SECRET is not configured on the server");
    return res.status(500).json({ message: "Server configuration error" });
  }

  const { token, error: headerError } = parseBearerToken(req.headers.authorization);

  if (headerError) {
    return unauthorized(res, headerError);
  }

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    if (error.code === "INVALID_TOKEN_PAYLOAD") {
      return unauthorized(res, "Not authorized, invalid token payload");
    }

    return unauthorized(res, "Not authorized, token failed verification");
  }

  try {
    const user = await User.findById(decoded.id, "-password");

    if (
      !user ||
      user.status !== ACTIVE_STATUS ||
      !User.USER_ROLES.includes(user.role)
    ) {
      return unauthorized(res, "Not authorized, invalid or inactive user");
    }

    req.user = user;

    return next();
  } catch (error) {
    logger.error("Error loading authenticated user", { error });
    return next(error);
  }
};

const requireRole = (...roles) => {
  const allowedRoles = new Set(roles);

  return (req, res, next) => {
    if (!req.user) {
      return unauthorized(res, "Not authorized, authentication required");
    }

    if (!allowedRoles.has(req.user.role)) {
      return forbidden(res, "Forbidden, insufficient permissions");
    }

    return next();
  };
};

const requireAdmin = requireRole("admin");

const requireVerified = (req, res, next) => {
  if (!req.user) {
    return unauthorized(res, "Not authorized, authentication required");
  }

  if (req.user.emailVerified !== true) {
    return forbidden(res, "Forbidden, email verification required");
  }

  return next();
};

const companyAccessDenied = (res) =>
  forbidden(res, "Forbidden, company access denied");

const requireCompanyMember = async (req, res, next) => {
  if (!req.user) {
    return unauthorized(res, "Not authorized, authentication required");
  }

  if (req.user.role !== "hr") {
    return companyAccessDenied(res);
  }

  const companyId = req.params.companyId;

  if (typeof companyId !== "string" || !mongoose.isValidObjectId(companyId)) {
    return res.status(400).json({ message: "Invalid company ID" });
  }

  try {
    const [company, membership] = await Promise.all([
      Company.findById(companyId),
      CompanyMember.findOne({
        company: companyId,
        user: req.user._id || req.user.id,
      }),
    ]);

    if (
      !company ||
      company.status !== ACTIVE_STATUS ||
      !membership ||
      membership.status !== ACTIVE_STATUS
    ) {
      return companyAccessDenied(res);
    }

    req.company = company;
    req.companyMember = membership;

    return next();
  } catch (error) {
    logger.error("Error loading company membership", { error });
    return next(error);
  }
};

const requireCompanyRole = (...roles) => {
  const allowedRoles = new Set(roles);

  return (req, res, next) => {
    if (
      !req.company ||
      req.company.status !== ACTIVE_STATUS ||
      !req.companyMember ||
      req.companyMember.status !== ACTIVE_STATUS
    ) {
      return companyAccessDenied(res);
    }

    if (!allowedRoles.has(req.companyMember.role)) {
      return forbidden(res, "Forbidden, insufficient company permissions");
    }

    return next();
  };
};

module.exports = {
  protect,
  requireRole,
  requireVerified,
  requireCompanyMember,
  requireCompanyRole,
};
