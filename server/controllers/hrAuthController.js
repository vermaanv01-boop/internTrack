const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const EmailVerificationToken = require("../models/emailVerificationTokenModel");
const { generateToken } = require("./authController");
const { onboardHrUser } = require("../services/hrOnboarding");
const { issueVerificationToken } = require("../services/verificationService");
const emailService = require("../services/emailService");
const { hashVerificationToken } = require("../utils/verificationToken");
const {
  validateHrRegistration,
  validateEmailVerification,
  validateResendVerification,
} = require("../utils/authValidation");
const logger = require("../utils/logger");

const genericResendMessage =
  "If an unverified HR account exists, a verification email has been sent.";
const emailDeliveryFailureMessage =
  "The verification email could not be sent. Please try resending it later.";

const responseForValidationErrors = (res, errors) =>
  res.status(400).json({
    message: "Validation failed",
    errors,
  });

const responseForDuplicateEmail = (res) =>
  res.status(400).json({
    message: "User already exists",
    errors: { email: "An account with this email already exists" },
  });

const isDuplicateEmailError = (error) => {
  if (!error || error.code !== 11000) {
    return false;
  }

  return Boolean(
    (error.keyPattern &&
      Object.prototype.hasOwnProperty.call(error.keyPattern, "email")) ||
      (error.keyValue &&
        Object.prototype.hasOwnProperty.call(error.keyValue, "email")),
  );
};

const toSafeHrUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt || user.timestamp,
});

const toSafeCompany = (company) => ({
  _id: company._id,
  name: company.name,
  slug: company.slug,
  status: company.status,
  verificationStatus: company.verificationStatus,
});

const toSafeMembership = (membership) => ({
  _id: membership._id,
  company: membership.company,
  role: membership.role,
  status: membership.status,
});

const logEmailFailure = (message, error) => {
  logger.error(message, {
    code: error && error.code,
    name: error && error.name,
  });
};

const registerHr = async (req, res, next) => {
  const { errors, data } = validateHrRegistration(req.body);

  if (errors) {
    return responseForValidationErrors(res, errors);
  }

  try {
    const userExists = await User.findOne({ email: data.email });

    if (userExists) {
      return responseForDuplicateEmail(res);
    }

    const user = await User.create({
      name: data.name,
      email: data.email,
      password: await bcrypt.hash(data.password, 10),
      role: "hr",
      emailVerified: false,
      status: "active",
      pendingCompanyName: data.companyName,
      pendingCompanyWebsite: data.companyWebsite,
    });

    const verification = await issueVerificationToken({ userId: user._id });

    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: verification.token,
      });
    } catch (error) {
      logEmailFailure("Failed to send HR registration verification email", error);
      return res.status(503).json({ message: emailDeliveryFailureMessage });
    }

    return res.status(201).json({
      message:
        "HR account registered. Please check your email to verify your account.",
      user: toSafeHrUser(user),
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return responseForDuplicateEmail(res);
    }

    if (error && error.code === 11000) {
      logger.error("Unexpected duplicate key while registering HR user", {
        keyPattern: error.keyPattern,
      });
      return next(error);
    }

    logger.error("Error registering HR user", { error });
    return next(error);
  }
};

const verifyHrEmail = async (req, res, next) => {
  const { errors, data } = validateEmailVerification(req.body);

  if (errors) {
    return responseForValidationErrors(res, errors);
  }

  try {
    const now = new Date();
    const tokenHash = hashVerificationToken(data.token);
    const verificationToken = await EmailVerificationToken.findUsableByHash(
      tokenHash,
      now,
    );

    if (!verificationToken) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification token" });
    }

    const user = await User.findById(verificationToken.user);

    if (!user || user.role !== "hr" || !user.pendingCompanyName) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification token" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is not active" });
    }

    const onboarding = await onboardHrUser({ user, now });
    const consumedToken = await EmailVerificationToken.consumeByHash(
      tokenHash,
      now,
    );

    if (!consumedToken) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification token" });
    }

    const authToken = generateToken(onboarding.user._id);

    return res.status(200).json({
      message: "Email verified successfully",
      user: toSafeHrUser(onboarding.user),
      company: toSafeCompany(onboarding.company),
      membership: toSafeMembership(onboarding.membership),
      token: authToken,
    });
  } catch (error) {
    logger.error("Error verifying HR email", { error });
    return next(error);
  }
};

const resendHrVerification = async (req, res, next) => {
  const { errors, data } = validateResendVerification(req.body);

  if (errors) {
    return responseForValidationErrors(res, errors);
  }

  try {
    const user = await User.findOne({ email: data.email, role: "hr" });

    if (
      !user ||
      user.emailVerified ||
      user.status !== "active" ||
      !user.pendingCompanyName
    ) {
      return res.status(200).json({ message: genericResendMessage });
    }

    const verification = await issueVerificationToken({
      userId: user._id,
      invalidateExisting: true,
    });

    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: verification.token,
      });
    } catch (error) {
      logEmailFailure("Failed to resend HR verification email", error);
      return res.status(503).json({ message: emailDeliveryFailureMessage });
    }

    return res.status(200).json({ message: genericResendMessage });
  } catch (error) {
    logger.error("Error resending HR verification email", { error });
    return next(error);
  }
};

module.exports = {
  registerHr,
  resendHrVerification,
  verifyHrEmail,
};
