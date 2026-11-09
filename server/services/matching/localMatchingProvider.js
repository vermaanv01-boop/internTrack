const { RELATED_SKILLS } = require("./skillTaxonomy");
const { extractSkills } = require("./skillMatcher");
const { extractEducation, extractExperience, extractKeywords } = require("./textSignals");

const WEIGHTS = {
    skills: 55,
    keywords: 15,
    experience: 20,
    education: 10,
};

const RELATED_FIELD_GROUPS = [
    ["computer science", "software engineering", "computer engineering", "information technology", "information systems", "data science", "electrical engineering", "mathematics", "statistics"],
];

const round = (value) => Math.round(value);

const formatYears = (value) => {
    if (!Number.isFinite(value) || value <= 0) {
        return "0";
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const getScoreLabel = (score) => {
    if (score >= 85) return "Strong Match";
    if (score >= 70) return "Good Match";
    if (score >= 50) return "Moderate Match";
    if (score >= 25) return "Fair Match";
    return "Needs Improvement";
};

const getRelatedFields = (requiredFields, candidateFields) => {
    if (requiredFields.length === 0 || candidateFields.length === 0) {
        return null;
    }

    const directMatches = requiredFields.filter((field) => candidateFields.includes(field));

    if (directMatches.length > 0) {
        return {
            match: true,
            matches: directMatches,
        };
    }

    const requiredGroup = RELATED_FIELD_GROUPS.find((group) => group.some((field) => requiredFields.includes(field)));
    const candidateInGroup = requiredGroup
        ? candidateFields.filter((field) => requiredGroup.includes(field))
        : [];

    return {
        match: candidateInGroup.length > 0,
        matches: candidateInGroup,
    };
};

const buildSkillAnalysis = (jobDescription, resumeText) => {
    const jobSkills = extractSkills(jobDescription);
    const resumeSkills = extractSkills(resumeText);
    const resumeByName = new Map(resumeSkills.map((skill) => [skill.name, skill]));
    const matchedSkills = [];
    const missingSkills = [];
    const relatedSkills = [];
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const jobSkill of jobSkills) {
        const emphasis = 1 + 0.15 * Math.min(jobSkill.occurrences - 1, 4);
        const weight = jobSkill.categoryWeight * emphasis;

        totalWeight += weight;

        const directMatch = resumeByName.get(jobSkill.name);

        if (directMatch) {
            earnedWeight += weight;
            matchedSkills.push({
                name: jobSkill.name,
                category: jobSkill.category,
                jobMentions: jobSkill.occurrences,
                resumeMentions: directMatch.occurrences,
            });
            continue;
        }

        const relatedCandidates = RELATED_SKILLS[jobSkill.name] || [];
        const relatedMatch = relatedCandidates
            .map((name) => resumeByName.get(name))
            .find(Boolean);

        if (relatedMatch) {
            earnedWeight += weight * 0.35;
            relatedSkills.push({
                jobSkill: jobSkill.name,
                resumeSkill: relatedMatch.name,
                reason: `${relatedMatch.name} is related to ${jobSkill.name}`,
            });
        }

        missingSkills.push({
            name: jobSkill.name,
            category: jobSkill.category,
            jobMentions: jobSkill.occurrences,
            relatedSkill: relatedMatch ? relatedMatch.name : null,
            weight,
        });
    }

    const score = totalWeight === 0 ? 100 : round((earnedWeight / totalWeight) * 100);

    return {
        score,
        jobSkills,
        matchedSkills,
        missingSkills,
        relatedSkills,
        matchedCount: matchedSkills.length,
        totalCount: jobSkills.length,
        relatedCount: relatedSkills.length,
    };
};

const buildExperienceAnalysis = (jobDescription, resumeText) => {
    const requirement = extractExperience(jobDescription, { mode: "requirement" });
    const candidate = extractExperience(resumeText);
    const requiredYears = requirement.years;
    const candidateYears = candidate.years;
    let score;
    let note;

    if (requiredYears === 0) {
        score = 100;
        note = "No explicit years-of-experience requirement was found in the job description.";
    } else if (candidateYears >= requiredYears) {
        score = 100;
        note = `Resume shows ${formatYears(candidateYears)} years of experience, meeting the ${formatYears(requiredYears)}-year requirement.`;
    } else if (candidateYears > 0) {
        score = Math.max(35, round((candidateYears / requiredYears) * 100));
        note = `Resume shows ${formatYears(candidateYears)} years of experience against a ${formatYears(requiredYears)}-year requirement.`;
    } else if (candidate.hasExperienceSignal) {
        score = 35;
        note = "Relevant experience is present but not quantified with an explicit number of years.";
    } else {
        score = 0;
        note = `No evidence of the ${formatYears(requiredYears)} years of experience requested by the job was found.`;
    }

    return {
        score,
        requiredYears,
        candidateYears,
        meetsRequirement: requiredYears === 0 || candidateYears >= requiredYears,
        gapYears: Math.max(0, requiredYears - candidateYears),
        requiredEvidence: requirement.evidence,
        candidateEvidence: candidate.evidence,
        note,
    };
};

const buildEducationAnalysis = (jobDescription, resumeText) => {
    const requirement = extractEducation(jobDescription, { mode: "requirement" });
    const candidate = extractEducation(resumeText);
    const fieldComparison = getRelatedFields(requirement.fields, candidate.fields);
    let score;
    let note;

    if (requirement.rank === 0) {
        score = 100;
        note = "No explicit degree-level requirement was found in the job description.";
    } else if (candidate.rank >= requirement.rank) {
        score = 100;
        note = `Resume education level (${candidate.label}) meets the ${requirement.label} requirement.`;
    } else if (candidate.rank > 0) {
        score = requirement.rank - candidate.rank === 1 ? 60 : 30;
        note = `Resume education level (${candidate.label}) is below the ${requirement.label} level requested.`;
    } else {
        score = 0;
        note = `No education level matching the ${requirement.label} requirement was detected.`;
    }

    if (fieldComparison && fieldComparison.match === false) {
        score = Math.max(20, score - 10);
        note += " The stated field of study does not appear to match the requested field.";
    }

    return {
        score,
        requiredLevel: requirement.level,
        requiredLabel: requirement.label,
        candidateLevel: candidate.level,
        candidateLabel: candidate.label,
        meetsRequirement: requirement.rank === 0 || candidate.rank >= requirement.rank,
        fieldMatch: fieldComparison ? fieldComparison.match : null,
        requiredFields: requirement.fields,
        candidateFields: candidate.fields,
        fieldMatches: fieldComparison ? fieldComparison.matches : [],
        requiredEvidence: requirement.evidence,
        candidateEvidence: candidate.evidence,
        note,
    };
};

const buildStrengths = ({ skillAnalysis, keywordAnalysis, experienceAnalysis, educationAnalysis }) => {
    const strengths = [];

    if (skillAnalysis.totalCount > 0) {
        const skillNames = skillAnalysis.matchedSkills.slice(0, 5).map((skill) => skill.name);
        const namesText = skillNames.length > 0 ? `, including ${skillNames.join(", ")}` : "";

        strengths.push(
            `Matches ${skillAnalysis.matchedCount} of ${skillAnalysis.totalCount} detected job skills${namesText}.`,
        );
    }

    const categoryCounts = new Map();

    for (const skill of skillAnalysis.matchedSkills) {
        categoryCounts.set(skill.category, (categoryCounts.get(skill.category) || 0) + 1);
    }

    for (const [category, count] of categoryCounts) {
        if (count >= 2 && strengths.length < 4) {
            strengths.push(`Shows multiple matches in ${category}.`);
        }
    }

    if (skillAnalysis.relatedSkills.length > 0) {
        const relatedText = skillAnalysis.relatedSkills
            .slice(0, 3)
            .map((item) => `${item.resumeSkill} (related to ${item.jobSkill})`)
            .join(", ");

        strengths.push(`Offers transferable experience in ${relatedText}.`);
    }

    if (experienceAnalysis.requiredYears > 0 && experienceAnalysis.meetsRequirement) {
        strengths.push(
            `Experience meets the ${formatYears(experienceAnalysis.requiredYears)}-year requirement.`,
        );
    }

    if (educationAnalysis.requiredLevel !== "none" && educationAnalysis.meetsRequirement) {
        strengths.push(`Education meets the ${educationAnalysis.requiredLabel} requirement.`);
    } else if (educationAnalysis.candidateLevel !== "none") {
        strengths.push(`Resume includes ${educationAnalysis.candidateLabel} education.`);
    }

    if (keywordAnalysis.totalKeywords > 0 && keywordAnalysis.matchedKeywords.length > 0) {
        strengths.push(
            `Includes ${keywordAnalysis.matchedKeywords.length} of ${keywordAnalysis.totalKeywords} prioritized job keywords.`,
        );
    }

    if (strengths.length === 0) {
        strengths.push("Resume contains relevant content that can be tailored more closely to this role.");
    }

    return strengths.slice(0, 6);
};

const buildImprovements = ({ skillAnalysis, keywordAnalysis, experienceAnalysis, educationAnalysis }) => {
    const improvements = [];
    const priorityMissing = [...skillAnalysis.missingSkills]
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 4);

    for (const skill of priorityMissing) {
        if (skill.relatedSkill) {
            improvements.push(
                `Add evidence of ${skill.name} if applicable; your ${skill.relatedSkill} experience is related.`,
            );
        } else {
            improvements.push(
                `Add evidence of ${skill.name} if applicable; it appears in the job description but not the resume.`,
            );
        }
    }

    if (experienceAnalysis.requiredYears > experienceAnalysis.candidateYears) {
        if (experienceAnalysis.candidateYears > 0) {
            improvements.push(
                `Clarify how your ${formatYears(experienceAnalysis.candidateYears)} years of experience cover the ${formatYears(experienceAnalysis.requiredYears)} years requested, especially with measurable outcomes.`,
            );
        } else {
            improvements.push(
                "Quantify relevant experience with explicit years, dates, or scope where accurate.",
            );
        }
    }

    if (educationAnalysis.requiredLevel !== "none" && !educationAnalysis.meetsRequirement) {
        improvements.push(
            `Highlight any coursework, certifications, or equivalent experience relevant to the ${educationAnalysis.requiredLabel} requirement.`,
        );
    }

    if (keywordAnalysis.missingKeywords.length > 0) {
        const missingTerms = keywordAnalysis.missingKeywords
            .slice(0, 4)
            .map((keyword) => keyword.keyword)
            .join(", ");

        improvements.push(`Consider adding missing job keywords where accurate: ${missingTerms}.`);
    }

    if (improvements.length === 0) {
        improvements.push("Resume covers the detected requirements; add measurable outcomes to strengthen impact.");
    }

    return improvements.slice(0, 6);
};

const buildSummary = (matchScore, matchLabel, skillAnalysis, keywordAnalysis) => {
    const parts = [`The resume is a ${matchLabel} with a match score of ${matchScore}/100.`];

    if (skillAnalysis.totalCount > 0) {
        parts.push(
            `It directly matches ${skillAnalysis.matchedCount} of ${skillAnalysis.totalCount} detected job skills`,
        );
    }

    if (keywordAnalysis.totalKeywords > 0) {
        parts.push(
            `and includes ${keywordAnalysis.matchedKeywords.length} of ${keywordAnalysis.totalKeywords} prioritized job keywords.`,
        );
    } else if (!parts[parts.length - 1].endsWith(".")) {
        parts[parts.length - 1] += ".";
    }

    return parts.join(" ");
};

const analyze = (resumeText, jobDescription) => {
    const skillAnalysis = buildSkillAnalysis(jobDescription, resumeText);
    const keywordAnalysis = extractKeywords(jobDescription, resumeText);
    const experienceAnalysis = buildExperienceAnalysis(jobDescription, resumeText);
    const educationAnalysis = buildEducationAnalysis(jobDescription, resumeText);
    const matchScore = round(
        skillAnalysis.score * (WEIGHTS.skills / 100)
        + keywordAnalysis.score * (WEIGHTS.keywords / 100)
        + experienceAnalysis.score * (WEIGHTS.experience / 100)
        + educationAnalysis.score * (WEIGHTS.education / 100),
    );
    const matchLabel = getScoreLabel(matchScore);

    return {
        matchScore,
        matchLabel,
        summary: buildSummary(matchScore, matchLabel, skillAnalysis, keywordAnalysis),
        matchedSkills: skillAnalysis.matchedSkills,
        missingSkills: skillAnalysis.missingSkills.map(({ weight, ...skill }) => skill),
        relatedSkills: skillAnalysis.relatedSkills,
        keywordAnalysis: {
            matchedKeywords: keywordAnalysis.matchedKeywords,
            missingKeywords: keywordAnalysis.missingKeywords,
            totalKeywords: keywordAnalysis.totalKeywords,
            coverage: keywordAnalysis.score,
        },
        experienceAnalysis: {
            requiredYears: experienceAnalysis.requiredYears,
            candidateYears: experienceAnalysis.candidateYears,
            meetsRequirement: experienceAnalysis.meetsRequirement,
            gapYears: experienceAnalysis.gapYears,
            requiredEvidence: experienceAnalysis.requiredEvidence,
            candidateEvidence: experienceAnalysis.candidateEvidence,
            note: experienceAnalysis.note,
        },
        educationAnalysis: {
            requiredLevel: educationAnalysis.requiredLevel,
            requiredLabel: educationAnalysis.requiredLabel,
            candidateLevel: educationAnalysis.candidateLevel,
            candidateLabel: educationAnalysis.candidateLabel,
            meetsRequirement: educationAnalysis.meetsRequirement,
            fieldMatch: educationAnalysis.fieldMatch,
            requiredFields: educationAnalysis.requiredFields,
            candidateFields: educationAnalysis.candidateFields,
            fieldMatches: educationAnalysis.fieldMatches,
            requiredEvidence: educationAnalysis.requiredEvidence,
            candidateEvidence: educationAnalysis.candidateEvidence,
            note: educationAnalysis.note,
        },
        strengths: buildStrengths({
            skillAnalysis,
            keywordAnalysis,
            experienceAnalysis,
            educationAnalysis,
        }),
        improvements: buildImprovements({
            skillAnalysis,
            keywordAnalysis,
            experienceAnalysis,
            educationAnalysis,
        }),
        scoreBreakdown: {
            skills: {
                score: skillAnalysis.score,
                weight: WEIGHTS.skills,
                weightedScore: round(skillAnalysis.score * (WEIGHTS.skills / 100)),
                matchedCount: skillAnalysis.matchedCount,
                totalCount: skillAnalysis.totalCount,
                relatedCount: skillAnalysis.relatedCount,
            },
            keywords: {
                score: keywordAnalysis.score,
                weight: WEIGHTS.keywords,
                weightedScore: round(keywordAnalysis.score * (WEIGHTS.keywords / 100)),
                matchedCount: keywordAnalysis.matchedKeywords.length,
                totalCount: keywordAnalysis.totalKeywords,
            },
            experience: {
                score: experienceAnalysis.score,
                weight: WEIGHTS.experience,
                weightedScore: round(experienceAnalysis.score * (WEIGHTS.experience / 100)),
                requiredYears: experienceAnalysis.requiredYears,
                candidateYears: experienceAnalysis.candidateYears,
            },
            education: {
                score: educationAnalysis.score,
                weight: WEIGHTS.education,
                weightedScore: round(educationAnalysis.score * (WEIGHTS.education / 100)),
                requiredLevel: educationAnalysis.requiredLevel,
                candidateLevel: educationAnalysis.candidateLevel,
            },
        },
        provider: "local",
        disclaimer: "This analysis uses deterministic local text matching and should be reviewed alongside the full resume and job description.",
    };
};

module.exports = {
    name: "local",
    analyze,
};
