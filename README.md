# Real-Time Chat App

A full-stack real-time chat application built with React, Spring Boot WebSockets (STOMP + SockJS), and MongoDB Atlas.

## Live Architecture

- Frontend: Vercel (React + Vite)
- Backend: Render (Spring Boot)
- Database: MongoDB Atlas (M0 free tier)
- CI/CD: GitHub push triggers auto-deploy on Vercel + Render

## Core Features

- Create and join chat rooms
- Real-time messaging via WebSockets
- Room-scoped message streams
- Persistent message history in MongoDB
- Automatic reconnect handling for backend cold starts

## Engineering Decisions

- STOMP over SockJS:
  selected for browser compatibility and simpler reconnect flow.
- MongoDB Atlas:
  managed free database for always-on cloud storage.
- Environment-driven config:
  sensitive and deployment-specific values are injected using environment variables.
- UTC timestamps (`Instant`):
  avoids timezone drift and keeps `time ago` behavior correct for all users.

## Recent Quality Improvements

- Added connection status badge in chat UI (`Connected`, `Reconnecting`, `Offline`).
- Added safe message input limits and disabled send behavior when disconnected.
- Added global backend error model with consistent JSON error responses.
- Added backend validation constraints for room ID, sender, and message content.
- Strengthened CORS and WebSocket origin handling for cloud deployments.

## Tradeoffs

- No authentication in current MVP:
  prioritized real-time reliability and deployment simplicity for first release.
- Render free tier cold starts:
  first request may be delayed after inactivity; client reconnect logic now handles this.
- In-memory simple broker:
  good for MVP scale, not ideal for horizontal scale without broker externalization.

## Local Development

### Backend

1. Set `MONGODB_URI` (optional; defaults to localhost MongoDB).
2. Run:
   - Windows: `.\mvnw.cmd spring-boot:run`
   - Mac/Linux: `./mvnw spring-boot:run`

### Frontend

1. Set `VITE_API_BASE_URL` (optional; defaults to `http://localhost:8080`).
2. Run:
   - `npm install`
   - `npm run dev`

## Deployment Environment Variables

### Render (Backend)

- `MONGODB_URI=<atlas-uri>`
- `FRONTEND_URL=<vercel-production-url>`

### Vercel (Frontend)

- `VITE_API_BASE_URL=<render-backend-url>`

## Testing Strategy

- Manual cross-tab tests for real-time delivery and room isolation.
- Cold-start reconnection test for Render free tier behavior.
- Compile/build checks on both frontend and backend for every production change.

## Next Milestones

- Add JWT authentication and room-level authorization.
- Add integration tests for REST + WebSocket message flow.
- Add presence indicators and delivery acknowledgments.
