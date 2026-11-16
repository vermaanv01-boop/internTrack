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
| `e2eIntegration.test.js` | Authentication lifecycle and application CRUD/isolation |
| `interviewPrep.test.js` | Question generation, provider fallback, generation validation, snapshots |
| `interviewPrepSession.test.js` | Session lifecycle, answer validation/evaluation, completion, history |
| `matching.test.js` | Matching analysis contract, validation, snapshots, local scoring behavior |
| `matchingHistory.test.js` | Matching history filters, sorting, detail/delete ownership, immutability |
| `resume.test.js` | Upload validation, extraction, versions, activation, download, cleanup |
| `securityHardening.test.js` | Security headers, error envelopes, rate limiting, auth hardening, redaction |
| `userProfile.test.js` | Profile update auth/ownership/validation, hashing, privilege-field injection, login token shape |

Current result: **112 passing tests**, including **25 newly added regression tests** in the three suites introduced before role work.

## Coverage Notes

- Tests are route-level integration tests with mocked persistence.
- User isolation is tested through cross-user tokens and owner-scoped queries.
- Password hashing is exercised with real bcrypt calls.
- Upload tests use real file buffers and temporary storage cleanup.
- Local matching and interview evaluation are tested for deterministic behavior.
- Provider fallback is tested separately from persistence.

## Known Limitations

- No real MongoDB integration/e2e tests exist.
- No browser/e2e tests are configured for the React client.
- No load, concurrency, or multi-instance JWT revocation tests exist.
- Current tests describe the job-seeker-only contract; role and company-permission behavior is not implemented or tested.
