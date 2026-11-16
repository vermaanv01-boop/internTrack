const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const emailService = require("../services/emailService");

const originalCreateTransport = nodemailer.createTransport;

let transportOptions;
let sentMessages;
let createTransportCalls;

beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  delete process.env.EMAIL_VERIFICATION_URL;
  delete process.env.CLIENT_URL;
  delete process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES;
  emailService.resetEmailTransport();
  transportOptions = [];
  sentMessages = [];
  createTransportCalls = 0;
  nodemailer.createTransport = (options) => {
    createTransportCalls += 1;
    transportOptions.push(options);

    return {
      sendMail: async (message) => {
        sentMessages.push(message);
        return { messageId: "test-message-id" };
      },
    };
  };
});

after(() => {
  nodemailer.createTransport = originalCreateTransport;
  emailService.resetEmailTransport();
});

test("builds the verification URL from EMAIL_VERIFICATION_URL and preserves existing query parameters", () => {
  process.env.EMAIL_VERIFICATION_URL =
    "https://app.example.com/verify?source=email";

  const url = new URL(emailService.buildVerificationUrl("token-with-+/="));

  assert.equal(url.origin, "https://app.example.com");
  assert.equal(url.pathname, "/verify");
  assert.equal(url.searchParams.get("source"), "email");
  assert.equal(url.searchParams.get("token"), "token-with-+/=");
});

test("falls back to the first CLIENT_URL origin and removes trailing slashes", () => {
  process.env.CLIENT_URL = "http://localhost:5173///,http://other.example.com";

  const url = new URL(emailService.buildVerificationUrl("raw-token"));

  assert.equal(url.origin, "http://localhost:5173");
  assert.equal(url.pathname, "/verify-email");
  assert.equal(url.searchParams.get("token"), "raw-token");
});

test("rejects verification URL generation when no URL configuration exists", () => {
  assert.throws(
    () => emailService.buildVerificationUrl("raw-token"),
    (error) =>
      error.code === "EMAIL_VERIFICATION_URL_NOT_CONFIGURED" &&
      error.statusCode === 503,
  );
});

test("rejects non-http verification URL configuration", () => {
  process.env.EMAIL_VERIFICATION_URL = "javascript:alert(1)";

  assert.throws(
    () => emailService.buildVerificationUrl("raw-token"),
    (error) =>
      error.code === "EMAIL_VERIFICATION_URL_NOT_CONFIGURED" &&
      error.statusCode === 503,
  );
});

test("sends verification email using environment-only SMTP configuration", async () => {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_USER = "smtp-user";
  process.env.SMTP_PASS = "smtp-pass";
  process.env.SMTP_FROM = "InternTrack AI <no-reply@example.com>";
  process.env.EMAIL_VERIFICATION_URL = "https://app.example.com/verify-email";
  process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = "30";

  await emailService.sendVerificationEmail({
    to: "hr@example.com",
    name: "<HR & Co>",
    token: "raw-token",
  });

  assert.equal(createTransportCalls, 1);
  assert.deepEqual(transportOptions[0], {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    auth: { user: "smtp-user", pass: "smtp-pass" },
  });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].from, "InternTrack AI <no-reply@example.com>");
  assert.equal(sentMessages[0].to, "hr@example.com");
  assert.equal(
    sentMessages[0].subject,
    "Verify your InternTrack AI HR account",
  );
  assert.match(sentMessages[0].text, /raw-token/);
  assert.match(sentMessages[0].text, /30 minutes/);
  assert.match(sentMessages[0].html, /raw-token/);
  assert.match(sentMessages[0].html, /&lt;HR &amp; Co&gt;/);
  assert.equal(sentMessages[0].html.includes("<HR & Co>"), false);
});

test("honors explicit SMTP_SECURE=false and reuses the cached transport", async () => {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_FROM = "no-reply@example.com";
  process.env.CLIENT_URL = "http://localhost:5173";

  await emailService.sendVerificationEmail({
    to: "one@example.com",
    name: "One",
    token: "first-token",
  });
  await emailService.sendVerificationEmail({
    to: "two@example.com",
    name: "Two",
    token: "second-token",
  });

  assert.equal(createTransportCalls, 1);
  assert.equal(transportOptions[0].port, 587);
  assert.equal(transportOptions[0].secure, false);
  assert.deepEqual(transportOptions[0].auth, undefined);
  assert.equal(sentMessages.length, 2);
});

test("fails closed when SMTP is not configured and never creates a transport", async () => {
  assert.equal(emailService.isEmailConfigured(), false);

  await assert.rejects(
    emailService.sendVerificationEmail({
      to: "hr@example.com",
      name: "HR",
      token: "raw-token",
    }),
    (error) =>
      error.code === "EMAIL_NOT_CONFIGURED" && error.statusCode === 503,
  );

  assert.equal(createTransportCalls, 0);
});

test("fails closed when SMTP credentials are incomplete", async () => {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_USER = "smtp-user";
  process.env.SMTP_FROM = "no-reply@example.com";
  process.env.CLIENT_URL = "http://localhost:5173";

  assert.equal(emailService.isEmailConfigured(), false);

  await assert.rejects(
    emailService.sendVerificationEmail({
      to: "hr@example.com",
      name: "HR",
      token: "raw-token",
    }),
    (error) => error.code === "EMAIL_NOT_CONFIGURED",
  );
  assert.equal(createTransportCalls, 0);
});
