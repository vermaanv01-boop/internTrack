const { protect, requireAdmin } = require("./authMiddleware");

const adminOnly = requireAdmin;
const protectAdmin = [protect, requireAdmin];

module.exports = {
    protect,
    requireAdmin,
    adminOnly,
    protectAdmin,
};
