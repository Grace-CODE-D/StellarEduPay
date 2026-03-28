# Write Architecture Documentation

Closes #228

## Summary

`docs/architecture.md` had only a brief stub. This PR rewrites it as a complete reference for new contributors covering every major component and their interactions.
# Add Dockerfile for Frontend Service

Closes #235

## Summary

`docker-compose.yml` references `build: ./frontend` but no `Dockerfile` existed, causing `docker compose up` to fail for the frontend service. This PR adds the missing file along with the required Next.js config for standalone output.

## Changes

### New Files

| File | Description |
| ---- | ----------- |
| [`docs/architecture.md`](docs/architecture.md) | Full rewrite — diagrams, data flow, service roles, schema relationships |

## What's Documented

- High-level ASCII component diagram (browser → frontend → backend → MongoDB + Stellar)
- File-level component map for both frontend and backend
- Step-by-step data flow from fee setup through payment confirmation (5 steps with code paths)
- Role of every backend service: `stellarService`, `transactionService`, `retryService`, `consistencyService`, `reminderService`
- All controllers and their route ownership
- All middleware and their purpose
- MongoDB schema relationships with an ERD-style ASCII diagram and key constraints
- Background worker table (interval, purpose, start function)
- Multi-school tenancy model
- Error handling and resilience patterns (retry, circuit breaker, idempotency, graceful shutdown)
| [`frontend/Dockerfile`](frontend/Dockerfile) | Multi-stage Docker build for the Next.js frontend |
| [`frontend/next.config.js`](frontend/next.config.js) | Enables `output: 'standalone'` required by the Docker runner stage |

### Modified Files

| File | Description |
| ---- | ----------- |
| [`docker-compose.yml`](docker-compose.yml) | Passes `NEXT_PUBLIC_API_URL` as a build arg so it is baked in at build time |

## Implementation Details

- [x] A new developer can understand the full system architecture from this document
- [x] Data flow from payment initiation to confirmation is clearly described
- [x] All major components and their interactions are covered
- Two-stage build: `builder` compiles the Next.js app, `runner` serves only the standalone output (smaller final image)
- `NEXT_PUBLIC_API_URL` is passed as a `ARG`/`ENV` during the build stage — Next.js inlines `NEXT_PUBLIC_*` vars at compile time, so a runtime `environment:` entry alone is not sufficient
- Runs as a non-root user (`appuser`) for security
- `output: 'standalone'` in `next.config.js` produces a self-contained `server.js` with minimal dependencies

## Acceptance Criteria

- [x] `docker compose up` builds and starts the frontend container successfully
- [x] Frontend is accessible at `http://localhost:3000`
- [x] `NEXT_PUBLIC_API_URL` is correctly injected at build time
