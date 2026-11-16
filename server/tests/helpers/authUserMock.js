const mongoose = require("mongoose");

const buildActiveUser = ({
  id = new mongoose.Types.ObjectId(),
  role = "jobseeker",
  emailVerified = true,
  status = "active",
  ...overrides
} = {}) => ({
  _id: id,
  name: "Test User",
  email: "test-user@example.com",
  role,
  emailVerified,
  status,
  ...overrides,
});

const installAuthUserMock = (User, resolveUser = null) => {
  const originalFindById = User.findById;

  User.findById = async (id, projection) => {
    if (resolveUser) {
      return resolveUser(id, projection);
    }

    return buildActiveUser({ id });
  };

  return () => {
    User.findById = originalFindById;
  };
};

module.exports = { buildActiveUser, installAuthUserMock };
