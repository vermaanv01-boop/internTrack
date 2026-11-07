const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured on the server");
    return res.status(500).json({ message: "Server configuration error" });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
    return res.status(401).json({ message: "Not authorized, invalid authorization header" });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.id !== "string" ||
      decoded.id.trim() === ""
    ) {
      return res.status(401).json({ message: "Not authorized, invalid token payload" });
    }

    req.user = { id: decoded.id };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed verification" });
  }
};

module.exports = { protect };
