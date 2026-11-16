# Testing

## Commands

Run from `server`:

```powershell
& npm.cmd test
```

Run from `client`:

```powershell
& npm.cmd run lint
& npm.cmd run build
```

PowerShell may block `npm.ps1`; use `npm.cmd` explicitly.

## Test Stack

- Runner: Node's built-in `node --test`
- HTTP assertions: Supertest
- App setup: Express routers mounted directly or the full app from `server.js`
- Database: mocked Mongoose models and in-memory stores
- No test currently connects to a real MongoDB instance

The test command is `node --test tests/*.test.js`. Node executes each test file in its own process, so per-file model overrides do not leak between suites.

## Suites

| Suite | Focus |
| --- | --- |
| `analytics.test.js` | Auth, user-scoped aggregation, zero-data contract, calculations, trend, errors |
| `applications.test.js` | Auth, create/defaults/validation, list filters/pagination/sort, CRUD ownership |
| `authorizationMiddleware.test.js` | Database-backed auth, platform/company RBAC, verification guard, escalation and cross-company denial |
| `e2eIntegration.test.js` | Authentication lifecycle and application CRUD/isolation |
| `emailService.test.js` | Environment-only SMTP config, URL generation, escaping, fail-closed delivery |
| `hrAuth.test.js` | HR registration, hashed tokens, resend rotation, verification, onboarding, concurrency, retry safety |
| `hrAuthRateLimit.test.js` | Registration, verification, and resend rate limiting |
| `interviewPrep.test.js` | Question generation, provider fallback, generation validation, snapshots |
| `interviewPrepSession.test.js` | Session lifecycle, answer validation/evaluation, completion, history |
| `matching.test.js` | Matching analysis contract, validation, snapshots, local scoring behavior |
| `matchingHistory.test.js` | Matching history filters, sorting, detail/delete ownership, immutability |
| `resume.test.js` | Upload validation, extraction, versions, activation, download, cleanup |
| `roleFoundationModels.test.js` | User/Company/CompanyMember/token defaults, enums, references, indexes, token lifecycle |
| `securityHardening.test.js` | Security headers, error envelopes, rate limiting, auth hardening, redaction |
| `userProfile.test.js` | Profile update auth/ownership/validation, hashing, privilege-field injection, login token shape |
| `userRoleMigration.test.js` | Migration defaults, dry-run, explicit-value preservation, idempotency, failure logging |

Current result: **157 passing tests**, including **11 HR authentication tests**, **8 email delivery tests**, **3 HR rate-limit tests**, **12 authorization-primitive tests**, **11 model/migration tests**, and **25 regression tests** added earlier.

## Coverage Notes

- Tests are route-level integration tests with mocked persistence.
- User isolation is tested through cross-user tokens and owner-scoped queries.
- Password hashing is exercised with real bcrypt calls.
- Upload tests use real file buffers and temporary storage cleanup.
- Local matching and interview evaluation are tested for deterministic behavior.
- Provider fallback is tested separately from persistence.
- Database-backed authentication, platform roles, email-verification gating, company membership, and company roles are tested with mocked model queries.
- HR registration, token hashing, token rotation, single-use verification, concurrent verification, idempotent onboarding, and partial-failure retries are tested with mocked persistence and email delivery.
- SMTP delivery is tested with a stubbed Nodemailer transport, not a real mail server.
- Existing job-seeker flows run against active database-backed jobseeker mocks to protect compatibility.

## Known Limitations

- No real MongoDB integration/e2e tests exist; model indexes, token lifecycle, and authorization queries are tested in-process.
- No browser/e2e tests are configured for the React client.
- Concurrency is tested at the request/mock level; no multi-instance race or real Mongo transaction tests exist.
- No multi-instance JWT revocation tests exist.
- HR authentication routes exist, but no HR job-management or company-scoped API routes exist yet.
- No real SMTP delivery test exists; SMTP credentials and mail servers are not available in the test environment.
