const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
process.env.AUTH_RATE_LIMIT_MAX = "2";
process.env.EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS = "60000";
process.env.EMAIL_VERIFICATION_RATE_LIMIT_MAX = "2";
process.env.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_WINDOW_MS = "60000";
process.env.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX = "2";

const hrAuthRoutes = require("../routes/hrAuthRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const app = express();
app.use(express.json());
app.use("/api/hr/auth", hrAuthRoutes);
app.use(errorHandler);

const sendThree = async (path) => {
  const responses = [];

  for (let index = 0; index < 3; index += 1) {
    responses.push(await request(app).post(path).send({}));
  }

  return responses;
};

test("rate limits HR registration attempts", async () => {
  const responses = await sendThree("/api/hr/auth/register");

  assert.deepEqual(
    responses.map((response) => response.status),
    [400, 400, 429],
  );
  assert.deepEqual(responses[2].body, {
    message: "Too many authentication attempts. Please try again later.",
  });
});

test("rate limits email verification attempts", async () => {
  const responses = await sendThree("/api/hr/auth/verify-email");

  assert.deepEqual(
    responses.map((response) => response.status),
    [400, 400, 429],
  );
  assert.deepEqual(responses[2].body, {
    message: "Too many verification attempts. Please try again later.",
  });
});

test("rate limits verification email resend requests", async () => {
  const responses = await sendThree("/api/hr/auth/resend-verification");

  assert.deepEqual(
    responses.map((response) => response.status),
    [400, 400, 429],
  );
  assert.deepEqual(responses[2].body, {
    message: "Too many verification email requests. Please try again later.",
  });
});
