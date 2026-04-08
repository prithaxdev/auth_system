# Auth System

A production-ready authentication system built with **Node.js**, **Express**, and **MongoDB**. This project covers the full authentication lifecycle — from registration and email OTP verification to login, token management, session handling, and multi-device logout.

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
  - [Route Prefixes & REST Structure](#12-route-prefixes--rest-structure)
  - [Middleware](#13-middleware)
- [Database Models](#database-models)
- [API Reference](#api-reference)
- [Auth Flow Diagrams](#auth-flow-diagrams)

---

## Project Structure

```
auth_system/
├── server.js                        # Entry point — starts server & connects DB
├── .env                             # Environment variables (never commit this)
├── package.json                     # Dependencies + Node.js imports map
└── src/
    ├── app.js                       # Express app setup & middleware registration
    ├── config/
    │   ├── config.js                # Loads & validates all env vars
    │   └── database.js              # Mongoose connection logic
    ├── controllers/
    │   └── auth.controller.js       # All auth business logic
    ├── models/
    │   ├── user.model.js            # User schema
    │   ├── session.model.js         # Session schema (refresh token store)
    │   └── otp.model.js             # OTP schema
    ├── routes/
    │   └── auth.routes.js           # Route definitions for /api/auth
    ├── services/
    │   └── email.service.js         # Nodemailer transporter & sendEmail()
    └── utils/
        └── utils.js                 # generateOTP() & getOtpHtml()
```

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Create your .env file
cp .env.example .env
# Fill in all required values

# Start development server
pnpm dev
```

---

## Environment Variables

Create a `.env` file in the root. All of these are **required** — the app will throw and refuse to start if any are missing.

| Variable              | Description                                      |
|-----------------------|--------------------------------------------------|
| `MONGO_URI`           | MongoDB connection string                        |
| `JWT_SECRET`          | Secret key used to sign and verify JWTs          |
| `GOOGLE_USER`         | Gmail address used to send emails                |
| `GOOGLE_CLIENT_ID`    | Google OAuth2 client ID                          |
| `GOOGLE_CLIENT_SECRET`| Google OAuth2 client secret                      |
| `GOOGLE_REFRESH_TOKEN`| Google OAuth2 refresh token for Gmail API access |

> **Security tip:** Never commit `.env` to version control. It is already added to `.gitignore`.

---

## Packages & Why We Use Them

### `express`
The core web framework. Handles routing, middleware chaining, request/response lifecycle. We use Express v5 which has built-in async error handling — no need to wrap every async route in a try/catch for unhandled promise rejections.

### `mongoose`
ODM (Object Document Mapper) for MongoDB. Lets us define schemas with validation rules, types, and defaults — and interact with the database using JavaScript objects instead of raw queries. We use it for all three models: `users`, `sessions`, and `otps`.

### `dotenv`
Loads environment variables from the `.env` file into `process.env` at startup. Without this, your secret keys and config values would have to be hardcoded or passed manually — both are bad practices.

### `jsonwebtoken`
The library used to **sign** and **verify** JWTs. We use it to create access tokens (short-lived) and refresh tokens (long-lived) after login/register, and to verify them on protected routes.

### `morgan`
HTTP request logger middleware. Every incoming request is logged to the console with method, route, status code, and response time (e.g. `POST /api/auth/login 200 76ms`). Essential for debugging during development.

### `cookie-parser`
Middleware that parses the `Cookie` header and populates `req.cookies`. We store the refresh token in an HTTP-only cookie, so we need this to read it back on requests like `/refresh-token` and `/logout`.

### `nodemailer`
Node.js library for sending emails. We use it with Gmail via **OAuth2** (not a plain password) to send OTP verification emails to new users. OAuth2 is used instead of a plain password because it is more secure and Google no longer allows less-secure app passwords by default.

---

## Core Concepts

### 1. Environment Variables & Config Validation

**File:** `src/config/config.js`

Rather than accessing `process.env.X` scattered across the codebase, all environment variables are loaded, validated, and exported from a single `config.js` file. If a required variable is missing, the app **throws immediately at startup** — this is called a **fail-fast** pattern. It prevents the server from running in a broken state where, for example, it cannot connect to the database or sign tokens.

```js
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}
```

This means you will never get a silent failure at runtime — the problem is surfaced immediately.

---

### 2. Absolute Path Aliases

**File:** `package.json` → `"imports"` field

In a Node.js ESM project, relative imports like `../../../config/config.js` get messy and break when files are moved. We use Node's native **subpath imports** feature to define clean aliases:

```json
"imports": {
  "#config/*": "./src/config/*.js",
  "#models/*": "./src/models/*.js",
  "#controllers/*": "./src/controllers/*.js",
  "#routes/*": "./src/routes/*.js",
  "#src/*": "./src/*.js"
}
```

Now instead of:
```js
import config from "../../../config/config.js"
```

We write:
```js
import config from "#config/config"
```

> **Important:** Because the alias already maps to `.js` files, you must **not** add `.js` to the import — doing so would result in `config.js.js` and a module-not-found error.

This is zero-dependency (no build tools required) and works natively in Node.js 12+.

---

### 3. Password Hashing

**Algorithm:** SHA-256 (via Node's built-in `crypto` module)

Passwords must **never** be stored as plain text. We hash the password before saving it to the database. Hashing is a one-way function — you cannot reverse a hash back to the original password. To verify a login, we hash the incoming password and compare it to the stored hash.

```js
const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
```

The same approach is used for OTP hashes and refresh token hashes — any sensitive value that needs to be stored but never read back in plain form.

---

### 4. JSON Web Tokens (JWT)

**Package:** `jsonwebtoken`

A **JWT** (JSON Web Token) is a compact, URL-safe token that encodes a JSON payload and is cryptographically signed. It has three parts separated by dots:

```
header.payload.signature
```

- **Header** — algorithm and token type
- **Payload** — the data (e.g. `{ id: "user123", sessionId: "abc" }`)
- **Signature** — HMAC-SHA256 of header + payload using the `JWT_SECRET`

The server signs the token with `JWT_SECRET`. Anyone can decode the payload, but only the server can **verify** the signature. If someone tampers with the payload, the signature becomes invalid.

```js
// Signing
const token = jwt.sign({ id: user._id }, config.JWT_SECRET, { expiresIn: "15m" });

// Verifying
const decoded = jwt.verify(token, config.JWT_SECRET);
```

---

### 5. Access Token

**Expiry:** `15 minutes`  
**Sent via:** `Authorization: Bearer <token>` header  
**Purpose:** Proves the user is authenticated for a short window of time

The access token is a short-lived JWT sent in the response body after a successful login or register. The client stores it in memory (not localStorage — that is vulnerable to XSS) and attaches it to every protected API request.

Because it expires quickly (15 minutes), even if it is stolen, the attacker has a very limited window to use it.

---

### 6. Refresh Token

**Expiry:** `7 days`  
**Sent via:** HTTP-only cookie  
**Purpose:** Used to silently obtain a new access token without re-logging in

The refresh token is a long-lived JWT. When the access token expires, the client calls `GET /api/auth/refresh-token`. The server reads the refresh token from the cookie, validates it against the database session, and issues a new access + refresh token pair.

The refresh token is **never** sent in the response body — only in an HTTP-only cookie. This prevents JavaScript from ever reading it, protecting against XSS attacks.

---

### 7. Token Rotation

Every time `GET /api/auth/refresh-token` is called, both tokens are replaced:

1. A new access token is issued
2. A new refresh token is issued
3. The old refresh token hash in the database is **overwritten** with the new one

This is called **refresh token rotation**. If a refresh token is stolen and used, the legitimate user's next refresh will fail (because the hash no longer matches), alerting to a potential breach. The old token is immediately invalidated.

---

### 8. HTTP-Only Cookies

**Set with:**
```js
res.cookie("refreshToken", refreshToken, {
  httpOnly: true,   // JS cannot access this cookie (XSS protection)
  secure: true,     // Only sent over HTTPS
  sameSite: "strict", // Not sent on cross-site requests (CSRF protection)
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
});
```

| Flag        | Why it matters                                                     |
|-------------|---------------------------------------------------------------------|
| `httpOnly`  | JavaScript (including malicious scripts) cannot read this cookie    |
| `secure`    | Cookie only transmitted over encrypted HTTPS connections            |
| `sameSite`  | Prevents the cookie from being sent in cross-origin requests (CSRF) |
| `maxAge`    | Cookie auto-expires after 7 days                                    |

---

### 9. Session Management

**Model:** `src/models/session.model.js`

Instead of storing the raw refresh token, we store a **SHA-256 hash** of it in a `sessions` collection in MongoDB. Each session document contains:

| Field              | Purpose                                               |
|--------------------|-------------------------------------------------------|
| `user`             | Reference to the user who owns this session           |
| `refreshTokenHash` | SHA-256 hash of the refresh token                     |
| `ip`               | IP address at time of login                           |
| `userAgent`        | Browser/client info at time of login                  |
| `revoked`          | Whether this session has been invalidated             |
| `timestamps`       | Auto-managed `createdAt` and `updatedAt`              |

This allows us to:
- **Logout a single device** — revoke just that one session
- **Logout all devices** — mark all of a user's sessions as `revoked: true`
- **Detect token reuse** — if the hash doesn't match any active session, the token is invalid

---

### 10. OTP (One-Time Password)

**Model:** `src/models/otp.model.js`  
**Generator:** `src/utils/utils.js` → `generateOTP()`

An OTP is a randomly generated 6-digit number that is valid for a single use. We generate it like this:

```js
const otp = Math.floor(100000 + Math.random() * 900000).toString();
```

This guarantees a 6-digit number (100000–999999). The OTP itself is never stored — only its **SHA-256 hash** is saved in the database. When the user submits the OTP, we hash their input and compare it to the stored hash.

```js
const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
```

This means even if the `otps` collection were leaked, attackers could not reverse the OTPs.

---

### 11. Email Verification Flow

**Service:** `src/services/email.service.js`  
**Template:** `src/utils/utils.js` → `getOtpHtml()`

Registration is a two-step process:

```
Step 1 — POST /api/auth/register
  → Create user (isVerified: false)
  → Generate OTP
  → Hash OTP and store in otps collection
  → Send OTP email via nodemailer (Gmail OAuth2)
  → Return success (no tokens yet)

Step 2 — GET /api/auth/verify-email
  → Receive { email, otp } from client
  → Hash the submitted OTP
  → Look up matching document in otps collection
  → Set user.isVerified = true
  → Delete all OTP records for this user
  → Return success
```

The user **cannot login** until `isVerified` is `true`. This prevents fake/throwaway email registrations and confirms the user owns the email address.

Gmail is used with **OAuth2** authentication (not a plain app password) via `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`. This is the secure, modern way to send emails via Gmail.

---

### 12. Route Prefixes & REST Structure

**File:** `src/app.js`

All auth routes are mounted under the `/api/auth` prefix:

```js
app.use("/api/auth", authRouter);
```

This is the **route prefix** — it means every route defined in `authRouter` is automatically namespaced under `/api/auth`. This is a REST convention that keeps routes organized and allows versioning later (e.g. `/api/v2/auth`).

Full route table:

| Method | Route                       | Description                          |
|--------|-----------------------------|--------------------------------------|
| POST   | `/api/auth/register`        | Register new user, send OTP email    |
| GET    | `/api/auth/verify-email`    | Verify email with OTP                |
| POST   | `/api/auth/login`           | Login, issue tokens, create session  |
| GET    | `/api/auth/get-me`          | Get current user from access token   |
| GET    | `/api/auth/refresh-token`   | Rotate tokens using refresh cookie   |
| GET    | `/api/auth/logout`          | Revoke current session               |
| GET    | `/api/auth/logout-all`      | Revoke all sessions for the user     |

---

### 13. Middleware

**File:** `src/app.js`

Middleware are functions that run on every request **before** it reaches the route handler. They are registered with `app.use()` in order.

```js
app.use(express.json());   // 1. Parse JSON bodies
app.use(morgan("dev"));    // 2. Log requests
app.use(cookieParser());   // 3. Parse cookies
app.use("/api/auth", authRouter); // 4. Route to auth handlers
```

| Middleware        | What it does                                                                 |
|-------------------|-------------------------------------------------------------------------------|
| `express.json()`  | Parses incoming `Content-Type: application/json` request bodies into `req.body` |
| `morgan("dev")`   | Logs every request: method, route, status, response time. `"dev"` = colored output |
| `cookieParser()`  | Parses `Cookie` header into `req.cookies` object so we can read `req.cookies.refreshToken` |

---

## Database Models

### User Model (`users`)

| Field        | Type    | Notes                          |
|--------------|---------|--------------------------------|
| `username`   | String  | Required, unique               |
| `email`      | String  | Required, unique               |
| `password`   | String  | SHA-256 hashed, required       |
| `isVerified` | Boolean | Defaults to `false`            |

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

| Field      | Type     | Notes                          |
|------------|----------|--------------------------------|
| `email`    | String   | Required                       |
| `user`     | ObjectId | Ref to `users`                 |
| `otpHash`  | String   | SHA-256 hash of the OTP        |
| `createdAt`| Date     | Auto via `timestamps: true`    |

---

## API Reference

### `POST /api/auth/register`
**Body:** `{ username, email, password }`  
Creates a new user, generates a 6-digit OTP, stores its hash, and sends a verification email. Returns the user object. No tokens are issued yet.

---

### `GET /api/auth/verify-email`
**Body:** `{ email, otp }`  
Hashes the submitted OTP and matches it against the database. On success, sets `isVerified: true` and clears all OTP records for that user.

---

### `POST /api/auth/login`
**Body:** `{ email, password }`  
Validates credentials. Blocks unverified users. On success, creates a session, issues an access token (response body) and a refresh token (HTTP-only cookie).

---

### `GET /api/auth/get-me`
**Header:** `Authorization: Bearer <accessToken>`  
Decodes the access token and returns the authenticated user's profile.

---

### `GET /api/auth/refresh-token`
**Cookie:** `refreshToken`  
Verifies the refresh token cookie, checks the session in the database, rotates both tokens, and updates the session hash.

---

### `GET /api/auth/logout`
**Cookie:** `refreshToken`  
Finds the matching session by token hash and sets `revoked: true`. Clears the refresh token cookie.

---

### `GET /api/auth/logout-all`
**Cookie:** `refreshToken`  
Decodes the refresh token to get the user ID, then revokes **all** active sessions for that user across every device.

---

## Auth Flow Diagrams

### Registration & Verification

```
Client                        Server                        DB / Email
  |                              |                              |
  |-- POST /register ----------->|                              |
  |   { username, email, pass }  |-- hash password              |
  |                              |-- create user -------------->|
  |                              |-- generate OTP               |
  |                              |-- hash OTP                   |
  |                              |-- store OTP hash ----------->|
  |                              |-- send OTP email ----------->|
  |<-- 201 { user } -------------|                              |
  |                              |                              |
  |-- GET /verify-email -------->|                              |
  |   { email, otp }             |-- hash submitted OTP         |
  |                              |-- find OTP doc in DB ------->|
  |                              |-- set isVerified = true ---->|
  |                              |-- delete OTP docs ---------->|
  |<-- 200 { user } -------------|                              |
```

### Login & Token Usage

```
Client                        Server                        DB
  |                              |                              |
  |-- POST /login -------------->|                              |
  |   { email, password }        |-- validate credentials ----->|
  |                              |-- create session ----------->|
  |                              |-- sign accessToken (15m)     |
  |                              |-- sign refreshToken (7d)     |
  |<-- 200 { accessToken }  -----|                              |
  |    Set-Cookie: refreshToken  |                              |
  |                              |                              |
  |-- GET /get-me -------------->|                              |
  |   Authorization: Bearer ...  |-- verify accessToken         |
  |<-- 200 { user } -------------|                              |
  |                              |                              |
  |  [15 min later, token expires]                              |
  |                              |                              |
  |-- GET /refresh-token ------->|                              |
  |   Cookie: refreshToken       |-- verify token               |
  |                              |-- find session in DB ------->|
  |                              |-- rotate both tokens         |
  |                              |-- update session hash ------>|
  |<-- 200 { newAccessToken } ---|                              |
  |    Set-Cookie: newRefreshToken                              |
```

---

## Security Summary

| Threat          | Mitigation                                                   |
|-----------------|--------------------------------------------------------------|
| XSS             | Refresh token in `httpOnly` cookie — JS cannot access it     |
| CSRF            | `sameSite: strict` on cookie, short-lived access tokens      |
| Token theft     | Access tokens expire in 15 min, refresh rotation invalidates stolen tokens |
| Password leak   | Passwords are SHA-256 hashed before storage                  |
| Fake emails     | Email OTP verification required before login is allowed      |
| DB token leak   | Only token hashes are stored, never raw tokens               |
| Missing config  | Fail-fast config validation at startup                       |