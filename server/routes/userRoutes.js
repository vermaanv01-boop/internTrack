const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();

const {registerUser , loginUser , updateUser , logoutUser} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.put(
  "/update/:id",
  protect,
  (req, res, next) => {
    if (req.user.id.toLowerCase() !== req.params.id.toLowerCase()) {
      return res.status(403).json({ message: "Not authorized to update this account" });
    }
    return next();
  },
  updateUser,
);
router.post("/logout", logoutUser);

module.exports = router;
