const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");

dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use("/api/users", userRoutes);

app.get("/" , (req, res) => {
    res.send("Job Tracking API is running....");
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
