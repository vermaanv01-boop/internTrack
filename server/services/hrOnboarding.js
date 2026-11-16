const crypto = require("crypto");
const User = require("../models/userModel");
const Company = require("../models/companyModel");
const CompanyMember = require("../models/companyMemberModel");

const EMAIL_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i;

const getEmailDomain = (email) => {
  const domain = String(email || "")
    .split("@")
    .pop()
    .trim()
    .toLowerCase();

  return EMAIL_DOMAIN_PATTERN.test(domain) ? domain : undefined;
};

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

const isDuplicateKeyError = (error) => Boolean(error && error.code === 11000);

const activateCompany = async (company, CompanyModel) => {
  if (company.status === "active") {
    return company;
  }

  return CompanyModel.findOneAndUpdate(
    { _id: company._id },
    { $set: { status: "active" } },
    { new: true },
  );
};

const upsertCompany = async (slug, defaults, CompanyModel) => {
  const update = {
    $set: {
      status: "active",
      verificationStatus: "self_registered",
    },
    $setOnInsert: defaults,
  };
  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  };

  try {
    return await CompanyModel.findOneAndUpdate({ slug }, update, options);
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existingCompany = await CompanyModel.findOne({ slug });

    if (!existingCompany) {
      throw error;
    }

    return CompanyModel.findOneAndUpdate(
      { _id: existingCompany._id },
      update,
      { new: true },
    );
  }
};

const upsertMembership = async (company, user, now, CompanyMemberModel) => {
  const filter = {
    company: company._id,
    user: user._id,
  };
  const update = {
    $set: {
      role: "owner",
      status: "active",
    },
    $setOnInsert: {
      joinedAt: now,
    },
  };
  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  };

  try {
    return await CompanyMemberModel.findOneAndUpdate(filter, update, options);
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existingMembership = await CompanyMemberModel.findOne(filter);

    if (!existingMembership) {
      throw error;
    }

    return CompanyMemberModel.findOneAndUpdate(
      { _id: existingMembership._id },
      update,
      { new: true },
    );
  }
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

  if (company) {
    company = await activateCompany(company, CompanyModel);
  } else {
    const slug = buildCompanySlug(user.pendingCompanyName, user._id);
    const companyDefaults = {
      name: user.pendingCompanyName,
      slug,
    };
    const emailDomain = getEmailDomain(user.email);

    if (user.pendingCompanyWebsite) {
      companyDefaults.website = user.pendingCompanyWebsite;
    }

    if (emailDomain) {
      companyDefaults.emailDomain = emailDomain;
    }

    company = await upsertCompany(slug, companyDefaults, CompanyModel);
  }

  const membership = await upsertMembership(
    company,
    user,
    now,
    CompanyMemberModel,
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
