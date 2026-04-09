# Architecture & Request Flow

This document traces the exact path a request takes from the moment it hits the server to the moment a response is sent back. Every layer is explained with its single responsibility and what it hands off to the next.

---

## Layer Stack (top to bottom)

```
HTTP Request
     │
     ▼
┌─────────────────────────────┐
│       Express App           │  app.js — global middleware + error handler
├─────────────────────────────┤
│       Route Layer           │  auth.routes.js — URL + HTTP method matching
├─────────────────────────────┤
│    Validator Middleware      │  auth.validators.js — input shape check
├─────────────────────────────┤
│    Protect Middleware        │  protect.js — identity + auth check (guarded routes only)
├─────────────────────────────┤
│      Controller Layer        │  auth.controller.js — reads req, writes res
├─────────────────────────────┤
│      Service Layer           │  auth.service.js — all business logic
├─────────────────────────────┤
│    Token Service             │  token.service.js — JWT, hashing, sessions, cookies
├─────────────────────────────┤
│    Email Service             │  email.service.js — sends transactional emails
├─────────────────────────────┤
│      Model Layer             │  Mongoose schemas — reads/writes MongoDB
└─────────────────────────────┘
     │
     ▼
HTTP Response
```

---

## One-liner per Layer

| Layer | File | One job |
|-------|------|---------|
| App | `src/app.js` | Mounts global middleware and the error handler |
| Route | `src/routes/auth.routes.js` | Maps method + URL to the right middleware chain |
| Validator | `src/middleware/validators/auth.validators.js` | Rejects malformed input before it reaches business logic |
| Protect | `src/middleware/protect.js` | Verifies the Bearer token and loads the user onto `req` |
| Controller | `src/controllers/auth.controller.js` | Reads `req`, calls a service, writes `res` |
| Auth Service | `src/services/auth.service.js` | Owns every business rule and throws `AppError` on failure |
| Token Service | `src/services/token.service.js` | All JWT and crypto operations — nothing else touches these |
| Email Service | `src/services/email.service.js` | Sends email via Nodemailer, throws on failure |
| Models | `src/models/` | Schema definitions and MongoDB queries |
| Error Handler | `src/middleware/errorHandler.js` | Last resort — converts any thrown error into a JSON response |
| AppError | `src/utils/AppError.js` | Carries a statusCode so the error handler knows what to send |
| AsyncHandler | `src/middleware/asyncHandler.js` | Catches async throws and forwards them to the error handler |

---

## Complete Request Flow

Below is the full round-trip for every type of request. Read this once and you will know exactly where to look when something goes wrong.

---

### Step 1 — Express App (`src/app.js`)

Every request passes through these in order before hitting any route:

```
express.json()    →  parses the JSON body into req.body
morgan("dev")     →  logs the method, path, and status to the terminal
cookieParser()    →  parses Cookie header into req.cookies
```

After these three, the request is handed to the router.

**Remember:** app.js boots the server, not the business logic. Its only job is middleware ordering. The error handler is also registered here — as the very last `app.use()` — so it catches errors from all routes.

---

### Step 2 — Route Layer (`src/routes/auth.routes.js`)

Express matches the incoming method + URL against the registered routes:

```
POST /api/auth/login  →  [validateLogin, login controller]
GET  /api/auth/get-me →  [protect, getMe controller]
```

If no route matches, Express falls through with a 404. If a route matches, it runs its middleware chain left to right.

**Remember:** Routes are just a table of method + path → middleware chain. No logic here, only wiring.

---

### Step 3 — Validator Middleware (`src/middleware/validators/auth.validators.js`)

Runs before the controller on routes that accept input. Checks shape and constraints:

```
validateRegister    →  username 3–30 chars, valid email, password ≥ 8 chars
validateLogin       →  email non-empty, password non-empty
validateVerifyEmail →  otp exactly 6 digits, email non-empty
validateForgotPassword → valid email format
validateResetPassword  → token param non-empty, password ≥ 8 chars
```

If any check fails, all errors are collected and sent immediately as a single `400` response. The controller is never called.

```
next(new AppError("Password must be at least 8 characters", 400))
```

**Remember:** Validators are a gate. Bad input is rejected here with a clear message. Nothing below this layer ever sees malformed data.

---

### Step 4 — Protect Middleware (`src/middleware/protect.js`) *(guarded routes only)*

Only runs on routes that require authentication (`GET /get-me`, `POST /logout-all`).

```
1. Read Authorization header → extract Bearer token
2. If missing → throw AppError("No token provided", 401)
3. tokenService.verifyToken(token) → decoded payload { id, session }
4. userModel.findById(decoded.id).select("-password")
5. If not found → throw AppError("User not found", 401)
6. req.user = user
7. req.sessionId = decoded.session
8. next()
```

JWT errors (expired, tampered) are thrown naturally and caught by the error handler.

**Remember:** Protect does one thing — prove the caller is who they say they are and load their identity onto `req`. Controllers never decode tokens themselves.

---

### Step 5 — Controller Layer (`src/controllers/auth.controller.js`)

Thin shell. Every function is wrapped with `asyncHandler` so any thrown error is forwarded to the error handler automatically.

```js
const login = asyncHandler(async (req, res) => {
  const { user, refreshToken, accessToken } = await authService.loginUser(req.body, req);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ ... });
});
```

The controller:
- Reads from `req` (body, cookies, params, user)
- Calls one service function
- Sets cookies if needed
- Writes the response

It does **not** contain any if/else business logic, no DB calls, no crypto.

**Remember:** If you are writing an `if` statement in a controller, it probably belongs in the service. Controllers only read, delegate, and respond.

---

### Step 6 — Auth Service (`src/services/auth.service.js`)

This is where every business rule lives. It knows what a valid login looks like, what happens when an OTP expires, and how to safely reset a password.

Example: `loginUser`

```
1. userModel.findOne({ email })
2. if not found → throw AppError("Invalid email or password", 401)
3. if !user.isVerified → throw AppError("Email is not verified", 401)
4. bcrypt.compare(password, user.password)
5. if false → throw AppError("Invalid email or password", 401)
6. tokenService.signRefreshToken(user._id)
7. tokenService.createSession(user._id, refreshToken, req)
8. tokenService.signAccessToken(user._id, session._id)
9. return { user, refreshToken, accessToken }
```

It throws `AppError` for every domain failure. The controller never checks return values for errors — if the service threw, the error handler handles it.

**Remember:** The service is the brain. It answers "is this allowed?", "does this exist?", "is this expired?". Every auth rule lives here and nowhere else.

---

### Step 7 — Token Service (`src/services/token.service.js`)

Owns all JWT and crypto operations. Called by auth.service and protect.js.

```
signAccessToken(userId, sessionId)  →  15-min JWT { id, session }
signRefreshToken(userId)            →  7-day JWT { id }
verifyToken(token)                  →  decoded payload (throws on invalid/expired)
hashToken(token)                    →  SHA-256 hex string
createSession(userId, token, req)   →  inserts session doc with hashed token
rotateSession(session, userId)      →  new tokens, overwrites hash in DB, returns both
setRefreshCookie(res, token)        →  sets httpOnly secure cookie with 7-day maxAge
```

**Remember:** If it involves signing, verifying, hashing, or a session document — it is in token.service. Nothing else in the codebase touches `jwt` or `crypto` directly.

---

### Step 8 — Email Service (`src/services/email.service.js`)

Sends transactional emails via Nodemailer using Gmail OAuth2. Does not swallow errors — if the email fails, the error propagates to the caller.

```
sendEmail(to, subject, text, html)  →  awaits transporter.sendMail(...)
```

auth.service decides what to do with that failure:
- **Registration** — catches and logs a warning, registration still succeeds
- **Forgot password** — catches, clears reset token from DB, throws 500

**Remember:** Email service just sends. The decision of whether a failure is fatal belongs to the service that called it.

---

### Step 9 — Model Layer (`src/models/`)

Mongoose schemas. Direct interface with MongoDB.

```
userModel.findOne({ email })
sessionModel.create({ user, refreshTokenHash, ip, userAgent })
otpModel.findOne({ email, otpHash })
```

Models also enforce schema-level validation (required fields, unique indexes). If a duplicate key is inserted, MongoDB throws an error with `code: 11000` — caught by the error handler and returned as a 409.

**Remember:** Models are the DB interface. They store and retrieve. They do not make decisions about what is valid at the business level — that is the service's job.

---

### Step 10 — Error Handler (`src/middleware/errorHandler.js`)

Mounted last in `app.js`. Catches every error forwarded by `next(err)` or thrown inside `asyncHandler`.

```
err.isOperational        →  use err.statusCode + err.message
err.name === 'JsonWebTokenError'   →  401 "Invalid token"
err.name === 'TokenExpiredError'   →  401 "Token has expired"
err.name === 'ValidationError'     →  400 with Mongoose field messages
err.code === 11000                 →  409 with duplicate field name
anything else              →  log full error, respond 500 "Something went wrong"
```

**Remember:** No route handler writes its own error responses. Everything is thrown upward and lands here. One place, one format, one responsibility.

---

## Full Example: `POST /api/auth/login`

```
POST /api/auth/login
Body: { email: "user@example.com", password: "password123" }

  │
  ▼ app.js
  express.json()       → req.body = { email, password }
  morgan()             → logs "POST /api/auth/login"
  cookieParser()       → req.cookies = {}

  │
  ▼ auth.routes.js
  matches POST /login  → runs [validateLogin, login]

  │
  ▼ validateLogin (validator middleware)
  email present?       → yes
  password present?    → yes
  no errors            → next()

  │
  ▼ login (controller)
  asyncHandler wraps the function
  calls authService.loginUser(req.body, req)

  │
  ▼ auth.service → loginUser()
  userModel.findOne({ email })    → found
  user.isVerified?                → true
  bcrypt.compare(pass, hash)      → match
  tokenService.signRefreshToken() → "eyJ..."
  tokenService.createSession()    → session doc in DB
  tokenService.signAccessToken()  → "eyJ..."
  return { user, refreshToken, accessToken }

  │
  ▼ back in controller
  tokenService.setRefreshCookie(res, refreshToken)
  res.status(200).json({ message, user, accessToken })

  │
  ▼ HTTP Response
  200 OK
  Set-Cookie: refreshToken=eyJ... (httpOnly, secure, sameSite=strict)
  Body: { message: "Logged in successfully", user: {...}, accessToken: "eyJ..." }
```

---

## Full Example: Error Path

```
POST /api/auth/login
Body: { email: "user@example.com", password: "wrongpassword" }

  │
  ▼ validateLogin  → passes (fields are present)

  │
  ▼ controller → authService.loginUser()

  │
  ▼ auth.service
  bcrypt.compare("wrongpassword", hash) → false
  throw new AppError("Invalid email or password", 401)

  │
  ▼ asyncHandler catches the throw → next(err)

  │
  ▼ errorHandler
  err.isOperational = true
  err.statusCode = 401

  │
  ▼ HTTP Response
  401 Unauthorized
  Body: { message: "Invalid email or password" }
```

---

## Where to Look When Something Breaks

| Symptom | Look here |
|---------|-----------|
| Request never reaches the route | `app.js` middleware order |
| 400 on valid-looking data | `auth.validators.js` — check the rules |
| 401 on a protected route | `protect.js` — token missing or expired |
| Wrong business behavior (wrong status, wrong logic) | `auth.service.js` |
| JWT not working | `token.service.js` |
| Email not sending | `email.service.js` + check Gmail OAuth2 credentials in `.env` |
| DB query returning wrong data | the model file + check the query in auth.service |
| Unhandled error returning 500 | `errorHandler.js` logs it — check the terminal |
| App crashes at startup | `config.js` — a required env var is missing |

---

## Short Rules to Remember

- **Route** — wiring only, no logic
- **Validator** — bad input dies here, never reaches the service
- **Protect** — sets `req.user`, never called inside a service
- **Controller** — reads req, calls one service fn, writes res. No ifs, no DB
- **Auth Service** — the only place where business rules live
- **Token Service** — the only place where jwt and crypto live
- **Email Service** — sends, does not decide if failure is fatal
- **Model** — talks to MongoDB, enforces schema, nothing else
- **Error Handler** — one place for all error responses, mounted last
- **AppError** — use it to throw user-facing errors with a status code
- **asyncHandler** — wraps every async controller so throws reach the error handler
