const mongoose = require("mongoose");
const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
    });

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt || user.timestamp,
    };

    res.status(201).json({
      message: "User registered successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("Error registering user", error);
    res.status(500).json({
      message: "Server error",
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }
    const generateToken = (id) => {
      return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    };
    const token = generateToken(user._id);

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt || user.timestamp,
    };

    res.status(200).json({
      message: "User logged in successfully",
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error("Error logging in user", error);
    res.status(500).json({
      message: "Server error",
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const update = { name, email };

    if (password !== undefined) {
      update.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(id, update, { new: true });

    const safeUser = user
      ? {
          _id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt || user.timestamp,
        }
      : undefined;

    res.status(200).json({
      message: "User updated successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("Error updating user", error);
    res.status(500).json({
      message: "Server error",
    });
  }
};

const logoutUser = async (req, res) => {
  try {

    res.status(200).json({ message: "User logged out successfully" });
  } catch (error) {
    console.error("Error logging out user", error);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = { registerUser, loginUser, updateUser, logoutUser };
