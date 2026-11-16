const crypto = require("crypto");
const User = require("../models/userModel");
const Company = require("../models/companyModel");
const CompanyMember = require("../models/companyMemberModel");

const slugify = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

const buildCompanySlug = (companyName, userId) => {
  const base = slugify(companyName) || "company";
  const suffix = crypto
    .createHash("sha256")
    .update(String(userId))
    .digest("hex")
    .slice(0, 8);

  return `${base}-${suffix}`;
};

const findExistingOwnerCompany = async (user, CompanyMemberModel, CompanyModel) => {
  const membership = await CompanyMemberModel.findOne({
    user: user._id,
    role: "owner",
    status: "active",
  });

  if (!membership) {
    return null;
  }

  return CompanyModel.findById(membership.company);
};

const onboardHrUser = async ({
  user,
  now = new Date(),
  UserModel = User,
  CompanyModel = Company,
  CompanyMemberModel = CompanyMember,
}) => {
  if (!user || user.role !== "hr") {
    const error = new Error("An HR user is required for company onboarding");
    error.statusCode = 400;
    throw error;
  }

  if (!user.pendingCompanyName) {
    const error = new Error("Company registration details are missing");
    error.statusCode = 400;
    throw error;
  }

  let company = await findExistingOwnerCompany(
    user,
    CompanyMemberModel,
    CompanyModel,
  );

  if (!company) {
    const slug = buildCompanySlug(user.pendingCompanyName, user._id);
    const companyDefaults = {
      name: user.pendingCompanyName,
      slug,
    };

    if (user.pendingCompanyWebsite) {
      companyDefaults.website = user.pendingCompanyWebsite;
    }

    company = await CompanyModel.findOneAndUpdate(
      { slug },
      {
        $set: {
          status: "active",
          verificationStatus: "self_registered",
        },
        $setOnInsert: companyDefaults,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  }

  const membership = await CompanyMemberModel.findOneAndUpdate(
    {
      company: company._id,
      user: user._id,
    },
    {
      $set: {
        role: "owner",
        status: "active",
      },
      $setOnInsert: {
        joinedAt: now,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  const verifiedUser = await UserModel.findOneAndUpdate(
    {
      _id: user._id,
      role: "hr",
      status: "active",
    },
    {
      $set: {
        emailVerified: true,
      },
    },
    { new: true },
  );

  if (!verifiedUser) {
    const error = new Error("Unable to activate the HR account");
    error.statusCode = 403;
    throw error;
  }

  return {
    company,
    membership,
    user: verifiedUser,
  };
};

module.exports = {
  buildCompanySlug,
  onboardHrUser,
  slugify,
};
