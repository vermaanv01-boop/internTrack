const { extractSkills } = require("../matching/skillMatcher");
const { extractEducation, extractExperience, extractKeywords } = require("../matching/textSignals");
const {
    CATEGORY_ORDER,
    QUESTION_CATEGORIES,
    QUESTION_DIFFICULTIES,
    TARGET_QUESTION_COUNT,
} = require("./constants");

const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];

const formatYears = (value) => {
    if (!Number.isFinite(value) || value <= 0) {
        return "0";
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const formatList = (items, fallback) => {
    const values = uniqueStrings(items).slice(0, 3);

    if (values.length === 0) {
        return fallback;
    }

    if (values.length === 1) {
        return values[0];
    }

    if (values.length === 2) {
        return `${values[0]} and ${values[1]}`;
    }

    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
};

const buildContext = ({ resumeText, jobDescription, jobTitle, company }) => {
    const jobSkills = extractSkills(jobDescription);
    const resumeSkills = extractSkills(resumeText);
    const keywordAnalysis = extractKeywords(jobDescription, resumeText);
    const experience = extractExperience(resumeText);
    const education = extractEducation(resumeText);
    const jobSkillNames = uniqueStrings(jobSkills.map((skill) => skill.name));
    const resumeSkillNames = uniqueStrings(resumeSkills.map((skill) => skill.name));
    const resumeSkillSet = new Set(resumeSkillNames);
    const sharedSkillNames = jobSkillNames.filter((name) => resumeSkillSet.has(name));
    const gapSkillNames = jobSkillNames.filter((name) => !resumeSkillSet.has(name));
    const keywordFocus = uniqueStrings([
        ...keywordAnalysis.missingKeywords.map((keyword) => keyword.keyword),
        ...keywordAnalysis.matchedKeywords.map((keyword) => keyword.keyword),
    ]);
    const technicalFocus = uniqueStrings([...sharedSkillNames, ...jobSkillNames, ...resumeSkillNames]);
    const focusAreas = uniqueStrings([...technicalFocus, ...keywordFocus]);
    const resumeEvidence = experience.years > 0
        ? `${formatYears(experience.years)} years of experience`
        : education.level !== "none"
            ? `${education.label} education`
            : null;

    return {
        jobTitle: jobTitle || null,
        company: company || null,
        jobDescription,
        resumeText,
        jobSkillNames,
        resumeSkillNames,
        sharedSkillNames,
        gapSkillNames,
        focusAreas,
        technicalFocus,
        primaryFocus: focusAreas[0] || null,
        secondaryFocus: focusAreas[1] || null,
        primaryTechnicalFocus: technicalFocus[0] || null,
        secondaryTechnicalFocus: technicalFocus[1] || null,
        sharedFocus: sharedSkillNames[0] || null,
        resumeFocus: resumeSkillNames[0] || null,
        gapFocus: gapSkillNames[0] || null,
        resumeEvidence,
        hasProjectSignal: /\b(?:project|capstone|built|developed|implemented|designed|created|launched|deployed|engineered)\b/i.test(resumeText),
        hasDataSignal: jobSkillNames.some((name) => [
            "SQL",
            "PostgreSQL",
            "MySQL",
            "MongoDB",
            "Data Science",
            "Machine Learning",
            "Data Analysis",
        ].includes(name)) || /\b(?:data|database|api|analytics|algorithm|performance|query)\b/i.test(jobDescription),
    };
};

const buildTechnicalQuestions = (context) => {
    const roleContext = context.jobTitle ? `the ${context.jobTitle} role` : "this role";
    const depthFocus = context.secondaryTechnicalFocus || context.primaryTechnicalFocus;
    const questions = [];

    if (context.sharedFocus) {
        questions.push({
            text: `Explain how you would apply ${context.sharedFocus} to a realistic problem in ${roleContext}. Include the tradeoffs you would weigh and how you would validate the result.`,
            whyRelevant: `The job description emphasizes ${context.sharedFocus}, and the resume provides related evidence, so this checks depth rather than basic recall.`,
            keyConcepts: [
                `${context.sharedFocus} fundamentals`,
                "design and integration choices",
                "tradeoffs",
                "validation and testing",
            ],
            evaluationCriteria: [
                "Explains the core concept accurately",
                "Connects technical choices to the role requirements",
                "Identifies tradeoffs and a validation approach",
            ],
        });
    } else if (context.primaryTechnicalFocus) {
        questions.push({
            text: `The job description emphasizes ${context.primaryTechnicalFocus}, which is not clearly documented in your resume. Describe any transferable knowledge you have and how you would build the missing skill safely.`,
            whyRelevant: `This tests how you reason about ${context.primaryTechnicalFocus} without assuming experience the resume does not show.`,
            keyConcepts: [
                `${context.primaryTechnicalFocus} fundamentals`,
                "transferable knowledge",
                "a learning plan",
                "boundaries and escalation",
            ],
            evaluationCriteria: [
                "Is explicit about what they do and do not know",
                "Does not invent experience",
                "Proposes a credible learning and validation plan",
            ],
        });
    } else {
        questions.push({
            text: `Which technical concept from this job description would you need to learn first, and how would you approach it?`,
            whyRelevant: "This tests how you prioritize technical learning when the job description contains limited explicit skill signals.",
            keyConcepts: ["requirement analysis", "learning strategy", "validation", "communication"],
            evaluationCriteria: [
                "Identifies a relevant technical concept",
                "Explains a practical learning approach",
                "Describes how they would verify understanding",
            ],
        });
    }

    if (depthFocus) {
        questions.push({
            text: `Suppose you had to introduce ${depthFocus} into an existing system. What technical risks would you address before and after deployment?`,
            whyRelevant: `The role calls for applied problem solving, and this explores how you would handle ${depthFocus} beyond surface-level familiarity.`,
            keyConcepts: [
                `${depthFocus} in production`,
                "risk assessment",
                "rollout and rollback",
                "monitoring",
            ],
            evaluationCriteria: [
                "Identifies realistic technical risks",
                "Proposes a staged rollout or mitigation plan",
                "Defines how success and failures would be observed",
            ],
        });
    } else {
        questions.push({
            text: "Describe how you would evaluate whether a technical approach is appropriate for a production system rather than only a local prototype.",
            whyRelevant: "This tests practical engineering judgment when the job description does not identify a single dominant technology.",
            keyConcepts: ["production constraints", "reliability", "security", "maintainability"],
            evaluationCriteria: [
                "Separates prototype concerns from production concerns",
                "Considers reliability, security, and maintenance",
                "Defines evidence for the decision",
            ],
        });
    }

    return questions;
};

const buildResumeQuestions = (context) => {
    const roleContext = context.jobTitle ? `the ${context.jobTitle} role` : "this role";
    const questions = [];
    const anchor = context.sharedFocus || context.resumeFocus;

    if (anchor) {
        const isShared = context.sharedSkillNames.includes(anchor);

        questions.push({
            text: `Walk me through the resume entry where you used ${anchor}. What was your specific contribution, and what evidence shows the result?`,
            whyRelevant: isShared
                ? `The role explicitly lists ${anchor}, and the resume appears to mention it, so this tests ownership and evidence behind that claim.`
                : `This anchors the interview in a concrete resume claim while testing ownership and evidence.`,
            keyConcepts: ["specific ownership", "technical decisions", "measurable outcome", "honest scope"],
            evaluationCriteria: [
                "Separates individual contribution from team work",
                "Explains a concrete decision or challenge",
                "Uses specific, credible evidence rather than broad claims",
            ],
        });
    } else {
        questions.push({
            text: "Which resume entry is most relevant to this role, and what specific evidence makes it relevant?",
            whyRelevant: "This tests whether you can connect documented experience to the role without relying on unsupported claims.",
            keyConcepts: ["resume evidence", "relevance", "specific ownership", "outcomes"],
            evaluationCriteria: [
                "Selects a genuinely relevant example",
                "Explains the connection to the role",
                "Supports the claim with specific evidence",
            ],
        });
    }

    if (context.resumeEvidence) {
        questions.push({
            text: `Your resume indicates ${context.resumeEvidence}. Which part of that experience best prepares you for ${roleContext}, and what would you do differently now?`,
            whyRelevant: "This asks you to connect documented experience to the role and demonstrate reflection rather than only listing history.",
            keyConcepts: ["experience relevance", "reflection", "growth", "role alignment"],
            evaluationCriteria: [
                "Chooses an experience that is genuinely relevant",
                "Explains the skills developed",
                "Shows credible reflection without overstating the outcome",
            ],
        });
    } else {
        questions.push({
            text: "Which experience or education entry on your resume best demonstrates readiness for this role, and what would you strengthen next?",
            whyRelevant: "This explores how you assess your own readiness using only evidence that appears on the resume.",
            keyConcepts: ["self-assessment", "resume evidence", "role alignment", "development plan"],
            evaluationCriteria: [
                "Grounds the answer in the resume",
                "Connects evidence to role needs",
                "Identifies a realistic area for improvement",
            ],
        });
    }

    return questions;
};

const buildDataStructureQuestions = (context) => {
    const questions = [];

    if (context.hasDataSignal) {
        questions.push({
            text: "This role involves data or API-oriented work. How would you choose a data structure or query strategy for fast lookups while controlling memory, correctness, and cost?",
            whyRelevant: "The job description emphasizes data, API, or performance work, so this tests practical data-structure and algorithm reasoning.",
            keyConcepts: ["data-structure selection", "time and space complexity", "query cost", "correctness"],
            evaluationCriteria: [
                "Compares realistic options rather than naming one structure",
                "Discusses time, space, and operational cost",
                "Checks correctness with edge cases",
            ],
        });
    } else {
        questions.push({
            text: "How would you break down an unfamiliar algorithmic problem, choose a data structure, and validate the solution before writing production code?",
            whyRelevant: "The role requires technical problem solving, so this tests a structured approach rather than memorized solutions.",
            keyConcepts: ["problem decomposition", "data-structure choice", "complexity", "edge cases"],
            evaluationCriteria: [
                "Clarifies constraints and expected input",
                "Compares approaches using complexity and tradeoffs",
                "Includes a validation strategy",
            ],
        });
    }

    questions.push({
        text: "Describe how you would diagnose an algorithm that passes small tests but becomes too slow or memory-heavy at production scale.",
        whyRelevant: "This tests performance reasoning and evidence-based debugging, which are relevant to the role's technical delivery expectations.",
        keyConcepts: ["profiling", "complexity analysis", "memory behavior", "benchmarking"],
        evaluationCriteria: [
            "Starts with measurement rather than guessing",
            "Identifies algorithmic and implementation bottlenecks",
            "Defines a verification step after optimization",
        ],
    });

    return questions;
};

const buildProjectQuestions = (context) => {
    const focus = context.resumeFocus;
    const questions = [];

    questions.push({
        text: focus
            ? `Choose the project or work item on your resume that best demonstrates your experience with ${focus}. Walk through your contribution, the key decisions, and the outcome.`
            : "Choose the project or work item on your resume that best demonstrates readiness for this role. Walk through your contribution, the key decisions, and the outcome.",
        whyRelevant: context.hasProjectSignal
            ? "The resume describes project or build work, so this tests depth, ownership, and the ability to explain results."
            : "This tests whether you can substantiate a resume claim with a concrete example and measurable outcome.",
        keyConcepts: ["ownership", "design decisions", "constraints", "measurable outcome"],
        evaluationCriteria: [
            "Describes a specific project or work item",
            "Explains individual decisions and tradeoffs",
            "Connects the outcome to credible evidence",
        ],
    });

    questions.push({
        text: "For that same project, what was the hardest constraint you faced, and how did you measure whether your solution succeeded?",
        whyRelevant: "This follows up on your strongest example to test reflection, prioritization, and evidence-based delivery.",
        keyConcepts: ["constraints", "prioritization", "measurement", "iteration"],
        evaluationCriteria: [
            "Identifies a concrete constraint",
            "Explains the tradeoff made",
            "Uses a credible measure of success",
        ],
    });

    return questions;
};

const buildBehavioralQuestions = (context) => {
    return [
        {
            text: context.gapFocus
                ? `Tell me about a time you had to learn ${context.gapFocus} or a similar technology quickly. How did you get productive, and what did you deliver?`
                : "Tell me about a time you had to learn a new technology quickly. How did you get productive, and what did you deliver?",
            whyRelevant: context.gapFocus
                ? `The role lists ${context.gapFocus}, which the resume does not clearly show, so this explores adaptability without assuming direct experience.`
                : "The role requires adaptability, so this tests how you learn and deliver under time pressure.",
            keyConcepts: ["learning speed", "prioritization", "ownership", "delivery"],
            evaluationCriteria: [
                "Uses a specific situation and action",
                "Shows how learning was validated",
                "Describes a concrete outcome",
            ],
        },
        {
            text: "Describe a time you disagreed with a teammate about a technical approach. How did you handle it, and what was the outcome?",
            whyRelevant: "This tests collaboration and conflict resolution, which affect delivery in any technical role.",
            keyConcepts: ["communication", "conflict resolution", "evidence-based decisions", "collaboration"],
            evaluationCriteria: [
                "Focuses on the problem rather than the person",
                "Explains how the disagreement was resolved",
                "Reflects on the outcome and what changed",
            ],
        },
    ];
};

const buildSituationalQuestions = (context) => {
    const companyName = context.company || "the company";
    const roleOpening = context.jobTitle ? `as a ${context.jobTitle}` : "in this role";
    const focus = context.primaryFocus || "one of the core job requirements";

    return [
        {
            text: `Imagine you join ${companyName} ${roleOpening} and discover that a key deliverable involving ${focus} is behind schedule. What would you do in your first week?`,
            whyRelevant: `This tests prioritization and communication in a realistic ${companyName} scenario tied to the role's requirements.`,
            keyConcepts: ["prioritization", "stakeholder communication", "risk assessment", "execution"],
            evaluationCriteria: [
                "Clarifies scope and constraints before acting",
                "Communicates risks and tradeoffs early",
                "Proposes a concrete recovery plan",
            ],
        },
        {
            text: "A stakeholder changes the requirements late in a project. How would you reassess scope, communicate tradeoffs, and protect quality?",
            whyRelevant: "This tests how you handle changing requirements while maintaining delivery quality.",
            keyConcepts: ["scope management", "tradeoffs", "stakeholder alignment", "quality"],
            evaluationCriteria: [
                "Identifies the impact on scope, time, and quality",
                "Presents options rather than only objections",
                "Maintains a validation plan",
            ],
        },
    ];
};

const buildRoleSpecificQuestions = (context) => {
    const companyName = context.company || "the company";
    const roleOpening = context.jobTitle ? `as a ${context.jobTitle}` : "in this role";
    const firstMonthFocus = formatList(context.jobSkillNames, "the job's core responsibilities");
    const deliveryFocus = formatList(context.sharedSkillNames, formatList(context.jobSkillNames, "the role's core outcomes"));

    return [
        {
            text: `If you joined ${companyName} ${roleOpening}, how would you prioritize your first month across ${firstMonthFocus}?`,
            whyRelevant: "This tests role-specific prioritization using the responsibilities and technologies named in the job description.",
            keyConcepts: ["onboarding", "prioritization", "stakeholder alignment", "delivery planning"],
            evaluationCriteria: [
                "Prioritizes based on business and technical impact",
                "Explains how priorities would be validated",
                "Names concrete first-step actions",
            ],
        },
        {
            text: `Which experience on your resume best prepares you to deliver ${deliveryFocus} at ${companyName}, and why?`,
            whyRelevant: "This connects the role's specific needs to documented resume evidence.",
            keyConcepts: ["role alignment", "resume evidence", "delivery impact", "transferable skills"],
            evaluationCriteria: [
                "Selects a relevant experience",
                "Makes a specific connection to the role",
                "Avoids unsupported claims",
            ],
        },
        {
            text: `What would success look like in your first 90 days ${roleOpening}, and which measures would you use?`,
            whyRelevant: "This tests whether you understand the role's expected outcomes and can define measurable success.",
            keyConcepts: ["outcome definition", "metrics", "stakeholder expectations", "delivery milestones"],
            evaluationCriteria: [
                "Defines realistic outcomes for 90 days",
                "Uses measurable indicators",
                "Accounts for onboarding and stakeholder alignment",
            ],
        },
    ];
};

const buildQuestion = (index, category, difficulty, data) => {
    const id = `q-${String(index).padStart(3, "0")}`;

    return {
        id,
        questionId: id,
        text: data.text,
        question: data.text,
        category,
        difficulty,
        whyRelevant: data.whyRelevant,
        relevance: data.whyRelevant,
        keyConcepts: data.keyConcepts,
        evaluationCriteria: data.evaluationCriteria,
    };
};

const generate = ({
    resumeText,
    jobDescription,
    jobTitle,
    company,
    difficulty = "mixed",
}) => {
    const context = buildContext({ resumeText, jobDescription, jobTitle, company });
    const questionsByCategory = {
        [QUESTION_CATEGORIES.TECHNICAL]: buildTechnicalQuestions(context),
        [QUESTION_CATEGORIES.RESUME_BASED]: buildResumeQuestions(context),
        [QUESTION_CATEGORIES.DATA_STRUCTURES_ALGORITHMS]: buildDataStructureQuestions(context),
        [QUESTION_CATEGORIES.PROJECT_DEEP_DIVE]: buildProjectQuestions(context),
        [QUESTION_CATEGORIES.BEHAVIORAL]: buildBehavioralQuestions(context),
        [QUESTION_CATEGORIES.SITUATIONAL]: buildSituationalQuestions(context),
        [QUESTION_CATEGORIES.ROLE_SPECIFIC]: buildRoleSpecificQuestions(context),
    };
    const questions = [];
    let index = 1;

    for (const category of CATEGORY_ORDER) {
        for (const data of questionsByCategory[category]) {
            const assignedDifficulty = difficulty === "mixed"
                ? QUESTION_DIFFICULTIES[(index - 1) % QUESTION_DIFFICULTIES.length]
                : difficulty;

            questions.push(buildQuestion(index, category, assignedDifficulty, data));
            index += 1;
        }
    }

    return {
        questions,
        categoriesCovered: uniqueStrings(questions.map((question) => question.category)),
        requestedDifficulty: difficulty,
        targetQuestionCount: TARGET_QUESTION_COUNT,
    };
};

module.exports = {
    name: "local",
    type: "local",
    generate,
};
