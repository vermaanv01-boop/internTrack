const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();

const {registerUser , loginUser , updateUser} = require("../controllers/authController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.put("/update/:id", updateUser);

module.exports = router;
