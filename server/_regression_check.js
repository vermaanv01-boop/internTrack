require("dotenv").config();
const mongoose = require("mongoose");
const request = require("supertest");

const baseUrl = process.env.MONGO_URL;
const tempDb = `interntrack_regression_${Date.now()}`;
const tempUrl = baseUrl.replace(/\/[^/?]*(\?|$)/, `/${tempDb}$1`);

process.env.MONGO_URL = tempUrl;
process.env.NODE_ENV = "test";
process.env.AUTH_RATE_LIMIT_MAX = "100";

const { app } = require("./server");
const connectDB = require("./config/db");

(async () => {
  let connected = false;
  try {
    await connectDB();
    connected = true;
    console.log("TEMP_DB_NAME=" + tempDb);

    const email = `regression-${Date.now()}@example.invalid`;
    const first = await request(app).post("/api/users/register").send({
      name: "Regression One",
      email,
      password: "password123",
    });
    console.log("FIRST_REGISTER_STATUS=" + first.status);
    console.log("FIRST_REGISTER_HAS_TOKEN=" + Boolean(first.body.token));

    const duplicate = await request(app).post("/api/users/register").send({
      name: "Regression Two",
      email,
      password: "password123",
    });
    console.log("DUPLICATE_REGISTER_STATUS=" + duplicate.status);
    console.log(
      "DUPLICATE_EMAIL_ERROR=" + (duplicate.body.errors && duplicate.body.errors.email)
    );

    const other = await request(app).post("/api/users/register").send({
      name: "Regression Three",
      email: `other-${Date.now()}@example.invalid`,
      password: "password123",
    });
    console.log("OTHER_REGISTER_STATUS=" + other.status);

    const indexes = await mongoose.connection.db.collection("users").indexes();
    console.log("INDEX_NAMES=" + indexes.map((index) => index.name).join(","));
  } catch (error) {
    console.log("REGRESSION_ERROR=" + error.message);
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await mongoose.connection.db.dropDatabase();
        console.log("TEMP_DB_DROPPED=true");
      } catch (error) {
        console.log("TEMP_DB_DROP_ERROR=" + error.message);
      }
    }
    await mongoose.disconnect().catch(() => {});
  }
})();
