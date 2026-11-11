require("dotenv").config();
const mongoose = require("mongoose");

const redact = (value) =>
  String(value || "")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted]")
    .replace(/\/\/[^@\s]+@/g, "//[redacted]@");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 8000 });
    const collection = mongoose.connection.db.collection("users");

    for (const name of ["phone_1", "password_1"]) {
      try {
        await collection.dropIndex(name);
        console.log("DROPPED=" + name);
      } catch (error) {
        if (error && (error.code === 27 || error.codeName === "IndexNotFound")) {
          console.log("ALREADY_ABSENT=" + name);
        } else {
          throw error;
        }
      }
    }

    const indexes = await collection.indexes();
    console.log(
      "INDEXES_AFTER=" +
        JSON.stringify(
          indexes.map((index) => ({
            name: index.name,
            key: index.key,
            unique: Boolean(index.unique),
          })),
          null,
          2
        )
    );
  } catch (error) {
    console.log("FIX_ERROR=" + redact(error && error.message));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
