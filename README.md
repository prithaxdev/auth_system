# Auth System

A production-ready authentication system built with **Node.js**, **Express v5**, and **MongoDB**. Covers the full authentication lifecycle — registration, email OTP verification, login, token rotation, session management, multi-device logout, and password reset.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Packages & Why We Use Them](#packages--why-we-use-them)
- [Core Concepts](#core-concepts)
  - [Environment Variables & Config Validation](#1-environment-variables--config-validation)
  - [Absolute Path Aliases](#2-absolute-path-aliases)
  - [Password Hashing](#3-password-hashing)
  - [JSON Web Tokens (JWT)](#4-json-web-tokens-jwt)
  - [Access Token](#5-access-token)
  - [Refresh Token](#6-refresh-token)
  - [Token Rotation](#7-token-rotation)
  - [HTTP-Only Cookies](#8-http-only-cookies)
  - [Session Management](#9-session-management)
  - [OTP (One-Time Password)](#10-otp-one-time-password)
  - [Email Verification Flow](#11-email-verification-flow)
  - [Service Layer](#12-service-layer)
  - [Middleware Layer](#13-middleware-layer)
  - [Centralized Error Handling](#14-centralized-error-handling)
  - [Input Validation](#15-input-validation)
  - [Route Prefixes & REST Structure](#16-route-prefixes--rest-structure)
  - [Forgot & Reset Password Flow](#17-forgot--reset-password-flow)
- [Database Models](#database-models)
- [API Reference](#api-reference)
- [Auth Flow Diagrams](#auth-flow-diagrams)
- [Security Summary](#security-summary)

---

## Project Structure

```
auth_system/
├── server.js                              # Entry point — starts server & connects DB
├── .env                                   # Environment variables (never commit this)
├── package.json                           # Dependencies + Node.js imports map
└── src/
    ├── app.js                             # Express app setup, middleware, error handler
    ├── config/
    │   ├── config.js                      # Loads & validates all env vars at startup
    │   └── database.js                    # Mongoose connection logic
    ├── controllers/
    │   └── auth.controller.js             # Thin req/res shell — delegates to services
    ├── middleware/
    │   ├── asyncHandler.js                # Wraps async fns, forwards errors to next()
    │   ├── errorHandler.js                # Global 4-arg Express error handler
    │   ├── protect.js                     # Verifies Bearer token, attaches req.user
    │   └── validators/
    │       └── auth.validators.js         # Per-route input validation middleware
    ├── models/
    │   ├── user.model.js                  # User schema (+ password reset fields)
    │   ├── session.model.js               # Session schema (refresh token store)
    │   └── otp.model.js                   # OTP schema (with MongoDB TTL index)
    ├── routes/
    │   └── auth.routes.js                 # Route definitions for /api/auth
    ├── services/
    │   ├── auth.service.js                # All business logic
    │   ├── token.service.js               # JWT sign/verify, hashing, session ops
    │   └── email.service.js               # Nodemailer transporter & sendEmail()
    └── utils/
        ├── AppError.js                    # Custom error class with statusCode
        └── utils.js                       # generateOTP(), getOtpHtml(), getResetPasswordHtml()
```

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Create your .env file and fill in all required values
cp .env.example .env

# Start development server (port defaults to 3000)
pnpm dev
```

---

## Environment Variables

Create a `.env` file in the root. All variables are **required** — the app throws and refuses to start if any are missing.

| Variable               | Description                                           |
|------------------------|-------------------------------------------------------|
| `MONGO_URI`            | MongoDB connection string                             |
| `JWT_SECRET`           | Secret key used to sign and verify JWTs               |
| `GOOGLE_USER`          | Gmail address used to send emails                     |
| `GOOGLE_CLIENT_ID`     | Google OAuth2 client ID                               |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret                           |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth2 refresh token for Gmail API access      |
| `CLIENT_URL`           | Frontend base URL (used in password reset email link) |
| `PORT`                 | Server port (optional, defaults to 3000)              |

> **Security tip:** Never commit `.env` to version control. It is already in `.gitignore`.

---

## Packages & Why We Use Them

### `express`
Core web framework. Handles routing, middleware chaining, request/response lifecycle. We use Express v5 which propagates async errors automatically when an async function throws — this works together with our `asyncHandler` wrapper.

### `mongoose`
ODM for MongoDB. Lets us define schemas with validation, types, and defaults. Used for all three models: `users`, `sessions`, and `otps`.

### `dotenv`
Loads environment variables from `.env` into `process.env` at startup. All values are then validated and re-exported through `src/config/config.js`.

### `jsonwebtoken`
Signs and verifies JWTs. Used to create short-lived access tokens (15 min) and long-lived refresh tokens (7 days), and to verify them on protected routes.

### `bcrypt`
Adaptive password hashing with automatic salting. Used at cost factor 12 for all passwords and password resets. Unlike SHA-256, bcrypt is designed to be slow and resist brute-force and rainbow table attacks.

### `morgan`
HTTP request logger. Logs method, route, status code, and response time for every request. Essential for debugging.

### `cookie-parser`
Parses the `Cookie` header and populates `req.cookies`. Required to read the refresh token from the HTTP-only cookie on `/refresh-token` and `/logout`.

### `nodemailer`
Sends emails via Gmail using **OAuth2** (not a plain password). Used for OTP verification emails and password reset emails.

---

## Core Concepts

### 1. Environment Variables & Config Validation

**File:** `src/config/config.js`

All environment variables are loaded, validated, and exported from a single config file. If any required variable is missing, the app **throws immediately at startup** (fail-fast pattern). This prevents the server from running in a broken state.

```js
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}
```

---

### 2. Absolute Path Aliases

**File:** `package.json` → `"imports"` field

Node.js native subpath imports replace messy relative paths with clean aliases:

```json
"imports": {
  "#config/*":     "./src/config/*.js",
  "#models/*":     "./src/models/*.js",
  "#controllers/*":"./src/controllers/*.js",
  "#routes/*":     "./src/routes/*.js",
  "#middleware/*": "./src/middleware/*.js",
  "#services/*":   "./src/services/*.js",
  "#utils/*":      "./src/utils/*.js",
  "#src/*":        "./src/*.js"
}
```

Usage:
```js
import config from "#config/config";
import AppError from "#utils/AppError";
```

> Do **not** add `.js` to the alias import — the alias already maps to `.js` files.

---

### 3. Password Hashing

**Algorithm:** bcrypt (cost factor 12)

Passwords are never stored as plain text. bcrypt hashes passwords with an automatic random salt and is intentionally slow, making brute-force attacks expensive.

```js
const hashed = await bcrypt.hash(password, 12);
const isValid = await bcrypt.compare(inputPassword, hashed);
```

Refresh token hashes and OTP hashes still use SHA-256 (via Node's built-in `crypto`) since those are random high-entropy values, not user-chosen secrets.

---

### 4. JSON Web Tokens (JWT)

**Package:** `jsonwebtoken`

A JWT encodes a JSON payload and is cryptographically signed. Three parts separated by dots: `header.payload.signature`. Anyone can decode the payload, but only the server can verify the signature using `JWT_SECRET`.

```js
// Signing
const token = jwt.sign({ id: user._id, session: session._id }, config.JWT_SECRET, { expiresIn: "15m" });

// Verifying
const decoded = jwt.verify(token, config.JWT_SECRET);
```

---

### 5. Access Token

**Expiry:** 15 minutes
**Sent via:** `Authorization: Bearer <token>` header
**Payload:** `{ id, session }`

Short-lived JWT returned in the response body after login. The client stores it in memory (not localStorage — vulnerable to XSS) and attaches it to every protected request. Short expiry limits the damage window if stolen.

---

### 6. Refresh Token

**Expiry:** 7 days
**Sent via:** HTTP-only cookie
**Payload:** `{ id }`

Long-lived JWT stored in an HTTP-only cookie. Used exclusively to get a new access token when the current one expires. Never returned in the response body — JavaScript cannot read HTTP-only cookies.

---

### 7. Token Rotation

Every call to `POST /refresh-token` replaces both tokens:
1. New access token is issued
2. New refresh token is issued
3. The old refresh token hash in the session is **overwritten**

If a refresh token is stolen and used, the legitimate user's next refresh fails (hash mismatch), signalling a potential breach.

---

### 8. HTTP-Only Cookies

```js
res.cookie("refreshToken", token, {
  httpOnly: true,       // JS cannot access this cookie (XSS protection)
  secure: true,         // Only sent over HTTPS
  sameSite: "strict",   // Not sent on cross-site requests (CSRF protection)
  maxAge: 7 * 24 * 60 * 60 * 1000
});
```

| Flag        | Why it matters                                                      |
|-------------|---------------------------------------------------------------------|
| `httpOnly`  | Blocks JavaScript — including injected scripts — from reading it    |
| `secure`    | Only transmitted over HTTPS                                         |
| `sameSite`  | Prevents the cookie from being sent in cross-origin CSRF requests   |
| `maxAge`    | Auto-expires after 7 days                                           |

---

### 9. Session Management

**File:** `src/models/session.model.js`

Each login creates a session document in MongoDB storing a **SHA-256 hash** of the refresh token (never the raw token). This enables:
- **Single-device logout** — revoke just that session
- **All-device logout** — mark all sessions for a user as `revoked: true`
- **Token reuse detection** — hash mismatch = invalid token

| Field              | Purpose                                               |
|--------------------|-------------------------------------------------------|
| `user`             | Reference to the owner                                |
| `refreshTokenHash` | SHA-256 hash of the refresh token                     |
| `ip`               | IP at login time                                      |
| `userAgent`        | Browser/client info at login time                     |
| `revoked`          | Whether this session has been invalidated             |

---

### 10. OTP (One-Time Password)

**File:** `src/models/otp.model.js`, `src/utils/utils.js`

A 6-digit number generated as:
```js
Math.floor(100000 + Math.random() * 900000).toString();
```

Only the SHA-256 hash is stored. The OTP document has a `expiresAt` field with a **MongoDB TTL index** that auto-deletes documents after 10 minutes. The application also checks `expiresAt > new Date()` as a defence-in-depth measure (MongoDB TTL task runs every ~60s).

---

### 11. Email Verification Flow

New users cannot login until their email is verified. Registration is a two-step process:

```
Step 1 — POST /register
  → Create user (isVerified: false)
  → Generate OTP, hash and store it
  → Send OTP email via Nodemailer (Gmail OAuth2)
  → Return 201

Step 2 — POST /verify-email
  → Hash submitted OTP, find match in DB
  → Check expiresAt is not past
  → Set user.isVerified = true
  → Delete all OTP records for this user
  → Return 200
```

---

### 12. Service Layer

**Files:** `src/services/auth.service.js`, `src/services/token.service.js`

All business logic lives in services, not controllers. Controllers are thin — they only handle HTTP concerns (reading `req`, writing `res`). This separation makes each piece independently testable.

- **`auth.service.js`** — register, login, verify email, refresh token, logout, forgot/reset password
- **`token.service.js`** — JWT sign/verify, SHA-256 hashing, session creation, token rotation, cookie helper

---

### 13. Middleware Layer

**Files:** `src/middleware/`

| Middleware          | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `asyncHandler.js`   | Wraps any async route fn and forwards thrown errors to `next()` |
| `protect.js`        | Verifies Bearer token, loads user from DB, attaches to `req.user` |
| `errorHandler.js`   | Global 4-arg error handler mounted last in `app.js`            |
| `validators/`       | Per-route input validation — rejects malformed requests early  |

---

### 14. Centralized Error Handling

**File:** `src/middleware/errorHandler.js`

A single 4-argument Express error handler catches everything:

| Error type               | Response                                      |
|--------------------------|-----------------------------------------------|
| `AppError` (operational) | `err.statusCode` + `err.message`              |
| `JsonWebTokenError`      | 401 "Invalid token"                           |
| `TokenExpiredError`      | 401 "Token has expired"                       |
| Mongoose `ValidationError` | 400 with field messages                     |
| Mongoose duplicate key (`11000`) | 409 with field name                 |
| Everything else          | 500 "Something went wrong" (logged to console)|

**File:** `src/utils/AppError.js`

```js
throw new AppError("Email is not verified", 401);
```

`AppError` carries a `statusCode` and `isOperational: true` flag. Operational errors are user-facing (wrong password, not found). Non-operational errors are bugs and get a generic 500.

---

### 15. Input Validation

**File:** `src/middleware/validators/auth.validators.js`

Each route has its own validation middleware that runs before the controller. All field errors are collected and returned together in a single 400 response — no external validation library required.

| Validator               | Rules                                                     |
|-------------------------|-----------------------------------------------------------|
| `validateRegister`      | username 3–30 chars; valid email format; password ≥ 8 chars |
| `validateLogin`         | email non-empty; password non-empty                        |
| `validateVerifyEmail`   | otp exactly 6 digits; email non-empty                      |
| `validateForgotPassword`| valid email format                                         |
| `validateResetPassword` | token in params non-empty; password ≥ 8 chars              |

---

### 16. Route Prefixes & REST Structure

All routes are mounted under `/api/auth`. HTTP methods follow REST semantics — state-changing operations use POST, not GET.

| Method | Route                      | Middleware             | Description                          |
|--------|----------------------------|------------------------|--------------------------------------|
| POST   | `/api/auth/register`       | validateRegister       | Register new user, send OTP email    |
| POST   | `/api/auth/verify-email`   | validateVerifyEmail    | Verify email with OTP                |
| POST   | `/api/auth/login`          | validateLogin          | Login, issue tokens, create session  |
| GET    | `/api/auth/get-me`         | protect                | Get current user from access token   |
| POST   | `/api/auth/refresh-token`  | —                      | Rotate tokens using refresh cookie   |
| POST   | `/api/auth/logout`         | —                      | Revoke current session               |
| POST   | `/api/auth/logout-all`     | protect                | Revoke all sessions for this user    |
| POST   | `/api/auth/forgot-password`| validateForgotPassword | Send password reset email            |
| POST   | `/api/auth/reset-password/:token` | validateResetPassword | Reset password with token    |

---

### 17. Forgot & Reset Password Flow

```
Step 1 — POST /forgot-password
  → Find user by email (silently return if not found — no enumeration)
  → Generate crypto.randomBytes(32) raw token
  → Hash and store on user doc with 1-hour expiry
  → Build reset link: CLIENT_URL/reset-password/<rawToken>
  → Send reset email
  → On email failure: clear stored token, throw 500

Step 2 — POST /reset-password/:token
  → Hash token from URL params
  → Find user where hash matches AND expiry is in the future
  → bcrypt.hash new password at cost 12
  → Clear passwordResetToken + passwordResetExpires
  → Revoke all active sessions (force re-login on all devices)
  → Return 200
```

Security notes:
- The raw token is only ever in the email link, never stored
- Only the SHA-256 hash is stored in the database
- Successful reset invalidates all existing sessions

---

## Database Models

### User Model (`users`)

| Field                  | Type    | Notes                                  |
|------------------------|---------|----------------------------------------|
| `username`             | String  | Required, unique                       |
| `email`                | String  | Required, unique                       |
| `password`             | String  | bcrypt hashed, required                |
| `isVerified`           | Boolean | Defaults to `false`                    |
| `passwordResetToken`   | String  | SHA-256 hash of reset token (optional) |
| `passwordResetExpires` | Date    | Expiry of reset token (optional)       |

### Session Model (`sessions`)

| Field              | Type      | Notes                          |
|--------------------|-----------|--------------------------------|
| `user`             | ObjectId  | Ref to `users`                 |
| `refreshTokenHash` | String    | SHA-256 hash of refresh token  |
| `ip`               | String    | Client IP at login time        |
| `userAgent`        | String    | Client browser/OS info         |
| `revoked`          | Boolean   | Defaults to `false`            |
| `createdAt`        | Date      | Auto via `timestamps: true`    |
| `updatedAt`        | Date      | Auto via `timestamps: true`    |

### OTP Model (`otps`)

| Field       | Type     | Notes                                           |
|-------------|----------|-------------------------------------------------|
| `email`     | String   | Required                                        |
| `user`      | ObjectId | Ref to `users`                                  |
| `otpHash`   | String   | SHA-256 hash of the OTP                         |
| `expiresAt` | Date     | TTL index — document auto-deleted after 10 min  |
| `createdAt` | Date     | Auto via `timestamps: true`                     |

---

## API Reference

### `POST /api/auth/register`
**Body:** `{ username, email, password }`
Creates user, generates and emails a 6-digit OTP. Returns 201 with user object. No tokens issued yet — email must be verified first.

---

### `POST /api/auth/verify-email`
**Body:** `{ email, otp }`
Hashes the OTP and matches against the database. Checks expiry. On success sets `isVerified: true` and deletes all OTP records for this user.

---

### `POST /api/auth/login`
**Body:** `{ email, password }`
Validates credentials with bcrypt. Blocks unverified accounts. Creates a session, returns access token in body and refresh token as an HTTP-only cookie.

---

### `GET /api/auth/get-me`
**Header:** `Authorization: Bearer <accessToken>`
Verifies token, loads user from DB, returns user object. User is attached to `req.user` by the `protect` middleware.

---

### `POST /api/auth/refresh-token`
**Cookie:** `refreshToken`
Verifies refresh token, checks active session in DB, rotates both tokens, updates session hash.

---

### `POST /api/auth/logout`
**Cookie:** `refreshToken`
Finds session by token hash, sets `revoked: true`, clears cookie.

---

### `POST /api/auth/logout-all`
**Header:** `Authorization: Bearer <accessToken>`
Revokes all active sessions for the authenticated user across all devices.

---

### `POST /api/auth/forgot-password`
**Body:** `{ email }`
Sends a password reset link to the email if it exists. Always returns 200 to prevent email enumeration.

---

### `POST /api/auth/reset-password/:token`
**Params:** `token` (from email link)
**Body:** `{ password }`
Validates token and expiry, hashes new password with bcrypt, clears reset fields, revokes all sessions.

---

## Auth Flow Diagrams

### Registration & Verification

```
Client                        Server                        DB / Email
  |                              |                              |
  |-- POST /register ----------->|                              |
  |   { username, email, pass }  |-- bcrypt.hash(password)      |
  |                              |-- create user -------------->|
  |                              |-- generate OTP               |
  |                              |-- hash OTP (SHA-256)         |
  |                              |-- store OTP hash ----------->|
  |                              |-- send OTP email ----------->|
  |<-- 201 { user } -------------|                              |
  |                              |                              |
  |-- POST /verify-email ------->|                              |
  |   { email, otp }             |-- hash submitted OTP         |
  |                              |-- find OTP doc in DB ------->|
  |                              |-- check expiresAt            |
  |                              |-- set isVerified = true ---->|
  |                              |-- delete OTP docs ---------->|
  |<-- 200 ----------------------|                              |
```

### Login & Token Usage

```
Client                        Server                        DB
  |                              |                              |
  |-- POST /login -------------->|                              |
  |   { email, password }        |-- bcrypt.compare ----------->|
  |                              |-- create session ----------->|
  |                              |-- sign accessToken (15m)     |
  |                              |-- sign refreshToken (7d)     |
  |<-- 200 { accessToken } ------|                              |
  |    Set-Cookie: refreshToken  |                              |
  |                              |                              |
  |-- GET /get-me -------------->|                              |
  |   Authorization: Bearer ...  |-- protect middleware         |
  |                              |-- verify token, load user -->|
  |<-- 200 { user } -------------|                              |
  |                              |                              |
  |  [access token expires]      |                              |
  |                              |                              |
  |-- POST /refresh-token ------->|                              |
  |   Cookie: refreshToken       |-- verify token               |
  |                              |-- find session in DB ------->|
  |                              |-- rotate both tokens         |
  |                              |-- update session hash ------>|
  |<-- 200 { newAccessToken } ---|                              |
  |    Set-Cookie: newRefreshToken                              |
```

### Forgot & Reset Password

```
Client                        Server                        DB / Email
  |                              |                              |
  |-- POST /forgot-password ---->|                              |
  |   { email }                  |-- find user by email ------->|
  |                              |-- randomBytes(32) rawToken   |
  |                              |-- store hash + expiry ------>|
  |                              |-- send reset email --------->|
  |<-- 200 (generic message) ----|                              |
  |                              |                              |
  |-- POST /reset-password/:tok->|                              |
  |   { password }               |-- hash token from params     |
  |                              |-- find user, check expiry -->|
  |                              |-- bcrypt.hash new password   |
  |                              |-- clear reset fields ------->|
  |                              |-- revoke all sessions ------>|
  |<-- 200 ----------------------|                              |
```

---

## Security Summary

| Threat                 | Mitigation                                                         |
|------------------------|--------------------------------------------------------------------|
| XSS                    | Refresh token in `httpOnly` cookie — JS cannot read it            |
| CSRF                   | `sameSite: strict` cookie + short-lived access tokens             |
| Token theft            | 15-min access tokens; refresh rotation invalidates stolen tokens  |
| Brute-force passwords  | bcrypt cost factor 12 — slow by design, salted automatically      |
| Rainbow tables         | bcrypt automatic per-password salt                                |
| Email enumeration      | Forgot-password always returns 200 regardless of email existence  |
| Fake email registration| OTP verification required before login is allowed                 |
| DB token leak          | Only SHA-256 hashes stored, never raw tokens or passwords in plain|
| Multi-device breach    | logout-all + password reset both revoke all active sessions       |
| Missing config         | Fail-fast validation at startup — server won't start if misconfigured |
