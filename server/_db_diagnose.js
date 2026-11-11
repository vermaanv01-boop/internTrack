require("dotenv").config();
const mongoose = require("mongoose");

const redact = (value) =>
  String(value || "")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted]")
    .replace(/\/\/[^@\s]+@/g, "//[redacted]@");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    console.log("CONNECTION=ok");
    console.log("DB_NAME=" + db.databaseName);
    console.log("HOST=" + mongoose.connection.host);
    console.log("PORT=" + mongoose.connection.port);

    const collection = db.collection("users");
    const indexes = await collection.indexes();
    console.log("INDEXES=" + JSON.stringify(indexes, null, 2));

    const count = await collection.countDocuments();
    console.log("USER_COUNT=" + count);

    for (const index of indexes) {
      if (!index.unique) continue;
      const fields = Object.keys(index.key);
      const group = {};
      for (const field of fields) group[field] = "$" + field;
      const duplicates = await collection
        .aggregate([
          { $group: { _id: group, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 5 },
        ])
        .toArray();
      console.log(
        "UNIQUE_INDEX_DUPES=" +
          JSON.stringify({
            index: index.name,
            key: index.key,
            duplicateGroups: duplicates.length,
          })
      );
    }
  } catch (error) {
    console.log("CONNECTION=error");
    console.log("ERROR_NAME=" + (error && error.name));
    console.log("ERROR_MESSAGE=" + redact(error && error.message));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
