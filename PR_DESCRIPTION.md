# Add Dockerfile for Backend Service

Closes #233

## Summary

`docker-compose.yml` references `build: ./backend` but no `Dockerfile` existed, causing `docker compose up` to fail immediately. This PR adds the missing `backend/Dockerfile`.

## Changes

### New Files

| File | Description |
| ---- | ----------- |
| [`backend/Dockerfile`](backend/Dockerfile) | Multi-layer Docker build for the Express backend |

## Implementation Details

- Base image: `node:18-alpine` (small, production-grade)
- Dependencies installed with `npm ci --omit=dev` (clean, no devDependencies)
- Runs as a non-root user (`appuser`) for security
- `HEALTHCHECK` hits `GET /health` every 30s so Docker and compose know when the container is ready
- `EXPOSE 5000` matches the port in `docker-compose.yml`

## Acceptance Criteria

- [x] `docker compose up` builds and starts the backend container successfully
- [x] Container runs as a non-root user
- [x] Health check endpoint reachable at `http://localhost:5000/health`
