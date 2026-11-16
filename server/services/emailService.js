const nodemailer = require("nodemailer");
const { getTokenTtlMinutes } = require("../utils/verificationToken");

const DEFAULT_SMTP_PORT = 587;

let cachedTransporter = null;
let cachedTransporterKey = null;

const configurationError = (message, code = "EMAIL_NOT_CONFIGURED") => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  return error;
};

const readSmtpConfiguration = () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const from = String(process.env.SMTP_FROM || "").trim();

  if (!host || !from) {
    throw configurationError("SMTP email is not configured");
  }

  const parsedPort = Number(process.env.SMTP_PORT);
  const port =
    Number.isSafeInteger(parsedPort) && parsedPort > 0
      ? parsedPort
      : DEFAULT_SMTP_PORT;
  const secureValue = String(process.env.SMTP_SECURE || "").toLowerCase();
  const secure =
    secureValue === "true"
      ? true
      : secureValue === "false"
        ? false
        : port === 465;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "");

  if ((user && !pass) || (!user && pass)) {
    throw configurationError("SMTP credentials are incomplete");
  }

  return {
    host,
    port,
    secure,
    from,
    auth: user ? { user, pass } : undefined,
  };
};

const isEmailConfigured = () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const from = String(process.env.SMTP_FROM || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "");

  return Boolean(host && from && Boolean(user) === Boolean(pass));
};

const getTransporter = () => {
  const config = readSmtpConfiguration();
  const cacheKey = `${config.host}:${config.port}:${config.secure}:${config.auth?.user || ""}`;

  if (!cachedTransporter || cachedTransporterKey !== cacheKey) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    cachedTransporterKey = cacheKey;
  }

  return cachedTransporter;
};

const buildVerificationUrl = (token) => {
  const configuredUrl = String(
    process.env.EMAIL_VERIFICATION_URL || "",
  ).trim();
  const clientUrl = String(process.env.CLIENT_URL || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
  const baseUrl = configuredUrl || (clientUrl ? `${clientUrl}/verify-email` : "");

  if (!baseUrl) {
    throw configurationError(
      "Verification URL is not configured",
      "EMAIL_VERIFICATION_URL_NOT_CONFIGURED",
    );
  }

  const url = new URL(baseUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw configurationError(
      "Verification URL must be an http or https URL",
      "EMAIL_VERIFICATION_URL_NOT_CONFIGURED",
    );
  }

  url.searchParams.set("token", token);
  return url.toString();
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendVerificationEmail = async ({ to, name, token }) => {
  const config = readSmtpConfiguration();
  const verificationUrl = buildVerificationUrl(token);
  const ttlMinutes = getTokenTtlMinutes();
  const displayName = name || "there";
  const transporter = getTransporter();

  await transporter.sendMail({
    from: config.from,
    to,
    subject: "Verify your InternTrack AI HR account",
    text: [
      `Hello ${displayName},`,
      "",
      "Verify your email address to finish setting up your HR account:",
      verificationUrl,
      "",
      `This link expires in ${ttlMinutes} minutes.`,
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>Hello ${escapeHtml(displayName)},</p>
      <p>Verify your email address to finish setting up your HR account:</p>
      <p><a href="${escapeHtml(verificationUrl)}">Verify email</a></p>
      <p>This link expires in ${ttlMinutes} minutes.</p>
      <p>If you did not create this account, you can ignore this email.</p>
    `,
  });
};

const resetEmailTransport = () => {
  cachedTransporter = null;
  cachedTransporterKey = null;
};

module.exports = {
  buildVerificationUrl,
  isEmailConfigured,
  resetEmailTransport,
  sendVerificationEmail,
};
