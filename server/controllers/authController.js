const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const {
  validateRegistration,
  validateLogin,
  validateUserUpdate,
} = require("../utils/authValidation");

const responseForValidationErrors = (res, errors) =>
  res.status(400).json({
    message: "Validation failed",
    errors,
  });

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT_SECRET is not configured");
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
    algorithm: "HS256",
  });
};

const toSafeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt || user.timestamp,
});

const registerUser = async (req, res, next) => {
  const { errors, data } = validateRegistration(req.body);

  if (errors) {
    return responseForValidationErrors(res, errors);
  }

  try {
    const userExists = await User.findOne({ email: data.email });

    if (userExists) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const user = await User.create({
      name: data.name,
      email: data.email,
      password: await bcrypt.hash(data.password, 10),
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: toSafeUser(user),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    logger.error("Error registering user", { error });
    return next(error);
  }
};

const loginUser = async (req, res, next) => {
  const { errors, data } = validateLogin(req.body);

  if (errors) {
    return responseForValidationErrors(res, errors);
  }

  try {
    const user = await User.findOne({ email: data.email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(data.password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      message: "User logged in successfully",
      user: toSafeUser(user),
      token,
    });
  } catch (error) {
    logger.error("Error logging in user", { error });
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  const { errors, data } = validateUserUpdate(req.body);

  if (errors) {
    return responseForValidationErrors(res, errors);
  }

  try {
    const { id } = req.params;
    const update = {};

    if (data.name !== undefined) {
      update.name = data.name;
    }

    if (data.email !== undefined) {
      update.email = data.email;
    }

    if (data.password !== undefined) {
      update.password = await bcrypt.hash(data.password, 10);
    }

    const user = await User.findByIdAndUpdate(id, update, { new: true });

    return res.status(200).json({
      message: "User updated successfully",
      user: user ? toSafeUser(user) : undefined,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    logger.error("Error updating user", { error });
    return next(error);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    return res.status(200).json({ message: "User logged out successfully" });
  } catch (error) {
    logger.error("Error logging out user", { error });
    return next(error);
  }
};

module.exports = { registerUser, loginUser, updateUser, logoutUser };
