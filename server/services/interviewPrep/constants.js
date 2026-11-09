const QUESTION_CATEGORIES = Object.freeze({
    TECHNICAL: "technical",
    RESUME_BASED: "resume-based",
    DATA_STRUCTURES_ALGORITHMS: "data-structures-and-algorithms",
    PROJECT_DEEP_DIVE: "project-deep-dive",
    BEHAVIORAL: "behavioral",
    SITUATIONAL: "situational",
    ROLE_SPECIFIC: "role-specific",
});

const CATEGORY_ORDER = Object.freeze([
    QUESTION_CATEGORIES.TECHNICAL,
    QUESTION_CATEGORIES.RESUME_BASED,
    QUESTION_CATEGORIES.DATA_STRUCTURES_ALGORITHMS,
    QUESTION_CATEGORIES.PROJECT_DEEP_DIVE,
    QUESTION_CATEGORIES.BEHAVIORAL,
    QUESTION_CATEGORIES.SITUATIONAL,
    QUESTION_CATEGORIES.ROLE_SPECIFIC,
]);

const DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced", "mixed"]);
const QUESTION_DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced"]);
const TARGET_QUESTION_COUNT = 15;

module.exports = {
    CATEGORY_ORDER,
    DIFFICULTIES,
    QUESTION_CATEGORIES,
    QUESTION_DIFFICULTIES,
    TARGET_QUESTION_COUNT,
};
