# API Contracts

Current contract for the InternTrack AI backend, including role-based HR registration and company onboarding.

## Conventions

- Base path: `/api`
- Request and response bodies are JSON unless noted.
- Protected endpoints require `Authorization: Bearer <jwt>`.
- Timestamps are ISO 8601 strings in JSON.
- Validation failures use:

```json
{
  "message": "Validation failed",
  "errors": {
    "field": "Explanation"
  }
}
```

- Unauthenticated protected requests return `401` with one of:
  - `{ "message": "Not authorized, no token provided" }`
  - `{ "message": "Not authorized, invalid authorization header" }`
  - `{ "message": "Not authorized, token failed verification" }`
  - `{ "message": "Not authorized, invalid token payload" }`
  - `{ "message": "Not authorized, invalid or inactive user" }`
- Unknown routes return `404` with `{ "message": "Route not found" }`.
- Unexpected failures return `500` with `{ "message": "Server error" }`.
- User-owned resources return `404` rather than `403` when an authenticated user requests another user's resource.

## Authentication Model

- Passwords are hashed with bcrypt before persistence.
- A successful login returns an HS256 JWT expiring after 30 days.
- JWT payload: `{ "id": "<user ObjectId>" }`.
- Protected-request middleware loads the current User by the token `id`, excludes the password hash, and sets `req.user` to the database document. JWT role claims are ignored.
- Deleted users, suspended users (`status !== "active"`), and users with an invalid platform role are rejected with `401`.
- The User data model has `role`, `emailVerified`, and `status`. Reusable `requireRole`, `requireVerified`, `requireCompanyMember`, and `requireCompanyRole` middleware exists. No HR job-management routes exist yet, but HR authentication routes are public until email verification completes.
- HR registration and email verification never trust client-supplied role, verification, status, company membership, ownership, or privilege fields.
- Login remains available to existing accounts and returns a database-backed token. Unverified HR accounts cannot satisfy `requireVerified` on protected HR routes.
- Company, CompanyMember, and EmailVerificationToken models are used by HR onboarding. Company-scoped API routes remain future work.
- Logout is stateless: the client discards the token; no server-side revocation list exists.
- Auth endpoints use an auth rate limiter: 20 requests per 15 minutes per client by default.
- Email verification endpoints use a verification limiter: 20 requests per 15 minutes per client by default.
- Verification-email resend uses a resend limiter: 5 requests per 15 minutes per client by default.
- Matching analysis and interview generation use a sensitive-action limiter: 60 requests per 15 minutes per client by default.

## Users

### `POST /api/users/register`

Public. Rate-limited by the auth limiter.

Request:

```json
{
  "name": "Alice Developer",
  "email": "alice@example.com",
  "password": "password123"
}
```

- `name`: required string, trimmed, 1-100 characters.
- `email`: required valid email, trimmed and lowercased, maximum 254 characters.
- `password`: required string, 8-128 characters.
- Unknown fields are ignored. In particular, client-supplied `role`, ownership, and verification fields are not persisted.
- Duplicate email is returned as `400`, not `409`.

Success: `201`

```json
{
  "message": "User registered successfully",
  "user": {
    "_id": "...",
    "name": "Alice Developer",
    "email": "alice@example.com",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- Registration does not return a token.
- The frontend logs the user in after successful registration.

Errors:

- `400` validation failure.
- `400` duplicate email:
  ```json
  {
    "message": "User already exists",
    "errors": { "email": "An account with this email already exists" }
  }
  ```

### `POST /api/users/login`

Public. Rate-limited by the auth limiter.

Request:

```json
{
  "email": "alice@example.com",
  "password": "password123"
}
```

- Login accepts existing passwords shorter than the registration minimum, preserving legacy password compatibility.
- Email validation still applies.

Success: `200`

```json
{
  "message": "User logged in successfully",
  "user": {
    "_id": "...",
    "name": "Alice Developer",
    "email": "alice@example.com",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "token": "<jwt>"
}
```

Errors:

- `400` validation failure.
- `404` `{ "message": "User not found" }`.
- `400` `{ "message": "Invalid credentials" }`.

### `PUT /api/users/update/:id`

Protected. Rate-limited by the auth limiter.

- The authenticated token's `id` must match the path `:id` case-insensitively.
- A different user ID returns `403`:
  ```json
  { "message": "Not authorized to update this account" }
  ```

Request fields, all optional but at least one is required:

```json
{
  "name": "Alice Smith",
  "email": "alice.smith@example.com",
  "password": "newpassword123"
}
```

- `name`: trimmed, 1-100 characters.
- `email`: valid email, trimmed and lowercased, maximum 254 characters.
- `password`: 8-128 characters; hashed before persistence.
- Unknown fields, including `role`, are ignored.
- An empty body or a body with only unknown fields returns:
  ```json
  {
    "message": "Validation failed",
    "errors": { "body": "Provide at least one field to update" }
  }
  ```

Success: `200`

```json
{
  "message": "User updated successfully",
  "user": {
    "_id": "...",
    "name": "Alice Smith",
    "email": "alice.smith@example.com",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- Password hashes and role/privilege fields are never serialized.
- If the database update finds no user, the existing contract still returns `200` with only the message.
- Duplicate email returns the same `400` duplicate-email envelope as registration.

### `POST /api/users/logout`

Public and stateless.

Success: `200`

```json
{ "message": "User logged out successfully" }
```

## Applications

All application endpoints are protected and scoped to the authenticated `req.user.id`.
Client-supplied `user`, `_id`, and other unknown fields are ignored on create and update.

Application fields:

| Field | Type | Rules |
| --- | --- | --- |
| `_id` | ObjectId | Generated by the server |
| `user` | ObjectId | Generated from the authenticated user |
| `company` | string | Required, trimmed |
| `role` | string | Required, trimmed; job title, not a permission role |
| `jobUrl` | string \| null | Must be an `http` or `https` URL |
| `location` | string \| null | Trimmed; empty becomes `null` |
| `employmentType` | string \| null | `full-time`, `part-time`, `internship`, `contract`, `other` |
| `status` | string | `saved`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`; defaults to `saved` |
| `appliedAt` | date \| null | Valid date string |
| `deadline` | date \| null | Valid date string |
| `salary` | string \| null | Trimmed |
| `notes` | string \| null | Trimmed |
| `description` | string \| null | Trimmed |
| `createdAt` | date | Generated |
| `updatedAt` | date | Generated |

### `POST /api/applications`

Request:

```json
{
  "company": "Google",
  "role": "Software Engineering Intern",
  "status": "applied",
  "employmentType": "internship",
  "jobUrl": "https://careers.google.com/jobs/123",
  "location": "Mountain View, CA"
}
```

Success: `201`

```json
{
  "message": "Application created successfully",
  "application": {
    "_id": "...",
    "user": "...",
    "company": "Google",
    "role": "Software Engineering Intern",
    "status": "applied",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Errors:

- `400` validation failure.
- `400` invalid application ID is not applicable to create.

### `GET /api/applications`

Query parameters:

| Parameter | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Positive integer, maximum 100 |
| `status` | none | Valid application status |
| `search` | none | Case-insensitive escaped match on `company` or `role` |
| `sort` | `newest` | `newest` or `oldest` by `createdAt` |

Success: `200`

```json
{
  "applications": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### `GET /api/applications/:id`

- Invalid ObjectId: `400` `{ "message": "Invalid application ID" }`.
- Missing or another user's application: `404` `{ "message": "Application not found" }`.

Success: `200` with `{ "application": { ... } }`.

### `PUT /api/applications/:id`

Partial update. Any subset of the application fields may be supplied, except ownership fields.

- Empty/unknown-only body: `400` `{ "message": "Validation failed", "errors": { "body": "Provide at least one valid field to update" } }`.
- At least one valid field is required.
- `user` and `_id` cannot be changed.
- Missing or another user's application: `404`.

Success: `200`

```json
{
  "message": "Application updated successfully",
  "application": { "...": "..." }
}
```

### `DELETE /api/applications/:id`

- Missing or another user's application: `404`.

Success: `200`

```json
{ "message": "Application deleted successfully" }
```

## Analytics

### `GET /api/analytics/dashboard`

Protected. Aggregations are scoped to the authenticated user.

Success: `200`

```json
{
  "overview": {
    "totalApplications": 11,
    "applicationsThisMonth": 4,
    "applicationsThisWeek": 2,
    "pendingApplications": 6,
    "interviews": 2,
    "offers": 1,
    "rejections": 1
  },
  "pipeline": {
    "saved": 2,
    "applied": 3,
    "screening": 1,
    "interview": 2,
    "offer": 1,
    "rejected": 1,
    "withdrawn": 1
  },
  "performance": {
    "responseRate": 0.625,
    "interviewRate": 0.25,
    "offerRate": 0.125
  },
  "trend": [
    { "month": "2026-06", "count": 1 }
  ],
  "recentApplications": [
    {
      "company": "Acme",
      "role": "Software Intern",
      "status": "interview",
      "createdAt": "2026-02-01T00:00:00.000Z"
    }
  ]
}
```

Definitions:

- `pendingApplications`: sum of `applied`, `screening`, and `interview`.
- `performance` denominator: sum of `applied`, `screening`, `interview`, `offer`, and `rejected`.
- Response statuses: `screening`, `interview`, `offer`, and `rejected`.
- Rates are fractions rounded to four decimal places; `0` is returned when the denominator is zero.
- `trend` always contains exactly six UTC months, oldest first, including zero counts.
- `recentApplications` contains at most five items, newest first, without `_id`.
- Invalid or missing ObjectId token payload: `401` `{ "message": "Not authorized, invalid token payload" }`.

## Resumes

All resume endpoints are protected and scoped to the authenticated user.

### `POST /api/resumes`

`multipart/form-data` with the file in the `resume` field.

- Allowed content: PDF or DOCX.
- Maximum size: 5 MB.
- The server validates file content, not just the extension or MIME type.
- Files are stored privately outside the client bundle.
- The first uploaded resume becomes active automatically.
- Responses never expose `storedFilename` or `extractedText`.

Success: `201`

```json
{
  "message": "Resume uploaded successfully",
  "resume": {
    "_id": "...",
    "originalName": "alice-resume.pdf",
    "mimeType": "application/pdf",
    "fileSize": 123456,
    "isActive": true,
    "hasExtractedText": true,
    "textLength": 4200,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Common errors:

- `400` missing file, unsupported/corrupted/disguised content, or invalid upload request.
- `413` file too large.
- `409` active-resume uniqueness conflict.

### `GET /api/resumes`

Success: `200` with `{ "resumes": [...] }`, newest first.

### `GET /api/resumes/:id`

Success: `200` with `{ "resume": { ... } }`.

### `GET /api/resumes/:id/download`

Success: the file stream with:

- `Content-Type` equal to the stored MIME type.
- `Content-Disposition: attachment`.
- `X-Content-Type-Options: nosniff`.
- `Cache-Control: private, no-store`.

Missing/cross-user resume or missing file: `404`.

### `PATCH /api/resumes/:id/activate`

- Makes the selected resume the only active resume for the user.

Success: `200`

```json
{
  "message": "Resume activated successfully",
  "resume": { "...": "..." }
}
```

- Already active: `200` `{ "message": "Resume is already active", "resume": { ... } }`.

### `DELETE /api/resumes/:id`

Deletes the database record and stored file.

Success: `200`

```json
{ "message": "Resume deleted successfully" }
```

## Matching

All matching endpoints are protected and scoped to the authenticated user.

### `POST /api/matching/analyze`

Sensitive-action rate-limited.

Request:

```json
{
  "jobDescription": "A job description of at least 100 characters...",
  "resumeId": "optional resume ObjectId",
  "jobTitle": "Software Engineering Intern",
  "company": "Acme"
}
```

- `jobDescription`: required string, trimmed, 100-30,000 characters.
- `resumeId`: optional; when omitted, the active resume is used.
- `jobTitle` and `company`: optional strings or null.

Success: `200`

```json
{
  "matchScore": 78,
  "matchLabel": "Strong match",
  "summary": "The resume is a Strong match with a match score of 78/100.",
  "matchedSkills": [],
  "missingSkills": [],
  "relatedSkills": [],
  "keywordAnalysis": {
    "matchedKeywords": [],
    "missingKeywords": [],
    "totalKeywords": 0,
    "coverage": 0
  },
  "experienceAnalysis": {},
  "educationAnalysis": {},
  "strengths": [],
  "improvements": [],
  "scoreBreakdown": {},
  "provider": "local",
  "disclaimer": "This analysis uses deterministic local text matching and should be reviewed alongside the full resume and job description.",
  "analysisId": "...",
  "id": "...",
  "jobTitle": "Software Engineering Intern",
  "company": "Acme"
}
```

Analysis is persisted as an immutable snapshot. Each successful request creates a new history record.
The local provider is deterministic and is not a semantic AI evaluator.

Errors:

- `400` missing/too-short/too-long job description.
- `400` invalid resume ID or resume without usable extracted text.
- `404` resume not found or no active resume.
- `500` `{ "message": "Server error" }` on unexpected provider/persistence failure.

### `GET /api/matching/history`

Query parameters:

| Parameter | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Positive integer, maximum 100 |
| `minScore` | none | Number 0-100 |
| `maxScore` | none | Number 0-100; must be >= `minScore` |
| `search` | none | Case-insensitive match on `jobTitle` or `company` |
| `sort` | `newest` | `newest` or `oldest` |

Success: `200`

```json
{
  "analyses": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

List summaries omit the full job description.

### `GET /api/matching/history/:id`

Success: `200` with `{ "analysis": { ... } }`.

- Includes both canonical and compatibility aliases such as `scoreLabel`/`matchLabel`, `partialMatches`/`relatedSkills`, and `experienceAlignment`/`experienceAnalysis`.

### `DELETE /api/matching/history/:id`

Success: `200`

```json
{ "message": "Matching analysis deleted successfully" }
```

## Interview Preparation

All interview-prep endpoints are protected and scoped to the authenticated user.

Session statuses: `not_started`, `in_progress`, `completed`.

Difficulty values: `beginner`, `intermediate`, `advanced`, `mixed`. Default: `mixed`.

The local provider targets 15 questions and is deterministic.

### `POST /api/interview-prep/generate`

Sensitive-action rate-limited.

Request:

```json
{
  "resumeId": "...",
  "jobDescription": "A job description of at least 100 characters...",
  "jobTitle": "Software Engineering Intern",
  "company": "Acme",
  "difficulty": "mixed"
}
```

- `resumeId`: required valid ObjectId, owned by the current user.
- `jobDescription`: required, 100-30,000 characters.
- `jobTitle` and `company`: optional strings or null.
- `difficulty`: optional; defaults to `mixed`.

Success: `201` with `{ "session": { ... } }`.

The session snapshot includes:

- `id`, `_id`, `user`, `resume`, `resumeId`, `resumeSnapshot`.
- `jobDescription`, `jobTitle`, `company`, `difficulty`.
- `questions`, `categoriesCovered`, `questionCount`.
- `status`, `startedAt`, `completedAt`, `currentQuestionIndex`, `currentQuestion`.
- `answers`, `answeredCount`, `answeredQuestionIds`, `unansweredCount`, `overallScore`.
- `provider`, `providerType`, `fallbackUsed`, `fallbackReason`, `disclaimer`.
- `createdAt`, `updatedAt`.

Each serialized question contains `id`/`questionId`, `text`/`question`, `category`, `difficulty`, `whyRelevant`/`relevance`, `keyConcepts`, and `evaluationCriteria`.

Errors:

- `400` validation failure.
- `404` resume not found.
- `400` resume without usable extracted text.
- `500` invalid question set returned by the provider.

### `POST /api/interview-prep/:id/start`

- Only a `not_started` session can be started.
- Sets `status` to `in_progress` and initializes `startedAt`, `currentQuestionIndex`, and `answers`.

Success: `200` with `{ "session": { ... } }`.

Errors:

- `400` invalid session ID.
- `404` missing or cross-user session.
- `409` completed, already started, inconsistent state, or no questions.

### `POST /api/interview-prep/:id/answer`

Request:

```json
{
  "questionId": "q-001",
  "answer": "An answer of at least 20 characters..."
}
```

- `questionId`: required non-empty string from the session.
- `answer`: required string, trimmed, 20-5,000 characters.
- One answer per question.
- The session must be `in_progress`.
- The answer is evaluated by the configured provider, with deterministic local fallback.

Success: `200`

```json
{
  "answer": {
    "questionId": "q-001",
    "answerText": "...",
    "submittedAt": "...",
    "score": 75,
    "strengths": [],
    "weaknesses": [],
    "missingConcepts": [],
    "improvementSuggestions": [],
    "evaluationProvider": "local",
    "evaluationProviderType": "local",
    "evaluationFallbackUsed": false,
    "evaluationFallbackReason": null,
    "evaluationMethod": "Deterministic local concept matching; not semantic AI evaluation."
  },
  "progress": {
    "status": "in_progress",
    "questionCount": 15,
    "answeredCount": 1,
    "unansweredCount": 14,
    "currentQuestionIndex": 1,
    "currentQuestion": {},
    "allQuestionsAnswered": false
  }
}
```

Errors:

- `400` invalid session ID or answer/question validation failure.
- `404` missing/cross-user session or unknown question.
- `409` not started, completed, or duplicate answer.

### `POST /api/interview-prep/:id/complete`

- Only an `in_progress` session can be completed.
- Repeated completion returns `409`.

Success: `200`

```json
{
  "session": { "...": "..." },
  "result": {
    "overallScore": 75,
    "questionsAttempted": 1,
    "questionsUnanswered": 14,
    "attemptedQuestionIds": [],
    "unansweredQuestionIds": [],
    "categoryPerformance": [],
    "strongestAreas": [],
    "weakestAreas": [],
    "recommendedTopics": [],
    "recommendedTopicsToRevise": []
  }
}
```

### `GET /api/interview-prep/history`

Query parameters:

| Parameter | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Positive integer, maximum 100 |
| `difficulty` | none | Valid difficulty |
| `search` | none | Case-insensitive match on `jobTitle` or `company` |
| `sort` | `newest` | `newest` or `oldest` |

Success: `200` with `{ "sessions": [...], "pagination": { ... } }`.

List summaries omit the job description and full questions/answers.

### `GET /api/interview-prep/history/:id`

Success: `200` with `{ "session": { ... } }`.

### `DELETE /api/interview-prep/history/:id`

Success: `200`

```json
{ "message": "Interview preparation session deleted successfully" }
```

## Health

### `GET /api/health`

Public.

Success when MongoDB is connected: `200`

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptime": 123,
  "database": {
    "status": "connected",
    "connected": true
  }
}
```

When MongoDB is not connected: `503` with `status: "degraded"` and `database.connected: false`.

The response never includes connection strings, environment secrets, or user data.

## Compatibility Notes

The following behavior is intentional in the current implementation and should not be changed as part of adding roles without an explicit contract update:

- Registration does not return a token.
- Logout does not revoke tokens and requires no authentication.
- User profile updates ignore unknown fields such as `role`.
- Updating a missing user returns `200` with only the success message.
- Every existing resource is scoped only by the owner's user ID.
- Duplicate registration/profile email is `400`; duplicate active resume is `409`.
- Matching analysis creation returns `200`, not `201`.
- Application, resume, matching, and interview list/search responses preserve their existing pagination envelopes.
