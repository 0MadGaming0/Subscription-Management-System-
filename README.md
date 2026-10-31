# Brightloop Software - Subscription Management System
## Part 1: Authentication & User Management (Production-Ready Implementation)

This repository contains **Part 1 (Authentication and User Management)** of the Brightloop Software Subscription Management platform, architected according to enterprise security standards and the Brightloop core specifications.

---

## 1. Project Directory Structure

```text
backend/
├── config/
│   └── db.js                        # Strict Mongoose MongoDB connection & lifecycle handlers
├── controllers/
│   └── authController.js            # Registration, login, profile, staff creation & password reset
├── middleware/
│   ├── authMiddleware.js            # JWT verification & active account status validation
│   ├── roleMiddleware.js            # Role-Based Access Control (RBAC: admin, staff, customer)
│   └── errorMiddleware.js           # Centralized 404 & structured error handler (Mongoose/JWT)
├── models/
│   └── User.js                      # User schema with bcrypt (cost factor 12) & crypto tokens
├── routes/
│   └── authRoutes.js                # Rate-limited authentication and user routing
├── scripts/
│   └── createAdmin.js               # Secure CLI bootstrap script for provisioning initial admin
├── services/
│   └── emailService.js              # Nodemailer service with branded HTML password reset emails
├── utils/
│   └── passwordValidator.js         # Strict validation (>8 chars, uppercase, lowercase, special char)
├── .env.example                     # Environment template with security parameters
├── .gitignore                       # Standard ignore rules (node_modules, .env, logs)
├── Brightloop_Part1_Auth_Postman_Collection.json # Ready-to-import Postman test suite
├── package.json                     # Production dependencies and scripts
├── README.md                        # Documentation and manual testing guide
└── server.js                        # Express server entry point with Helmet, CORS & graceful exit
```

---

## 2. Security Architecture & Implementation Highlights

1. **Password Security**:
   - Strictly requires **MORE than 8 characters** (minimum 9 characters), at least one uppercase letter, one lowercase letter, and one special character.
   - Hashed using **`bcryptjs`** with a work factor of **12 salt rounds**.
   - Password and reset token fields are marked `{ select: false }` in Mongoose and systematically stripped during `toJSON` transforms to prevent accidental leakages in queries or logs.

2. **Role-Based Access Control (RBAC)**:
   - Three well-defined roles: `admin`, `staff`, and `customer`.
   - **Mass Assignment Immunity**: Public registration (`POST /api/auth/register`) explicitly sets `role: 'customer'`, ignoring any client-supplied role parameters.
   - **Admin-Gated Staff Creation**: Only authenticated administrators can create staff accounts (`POST /api/auth/staff`).
   - Reusable `authorize('admin', 'staff')` middleware provides declarative route protection.

3. **Secure Admin Provisioning**:
   - The initial administrator cannot be created through public HTTP APIs.
   - Created exclusively via the secure CLI bootstrap script (`npm run create-admin`) with interactive masked password input or environment flags.

4. **Cryptographic Password Reset Flow**:
   - Generates cryptographically secure 32-byte pseudo-random tokens using Node.js `crypto.randomBytes(32)`.
   - Only the **SHA-256 hash** of the token is persisted in MongoDB.
   - **Time-Limited**: Tokens expire strictly after **15 minutes**.
   - **Single-Use**: Reset tokens and expiry dates are wiped immediately upon successful password reset.
   - **Anti-Enumeration Protection**: Forgot-password requests return an identical generic response regardless of whether the email address is registered.

5. **Defense-in-Depth HTTP Protections**:
   - **Helmet**: Secures HTTP response headers against clickjacking, MIME sniffing, and cross-site scripting.
   - **CORS**: Configured with strict origin checks.
   - **Express Rate Limiting**:
     - `loginLimiter`: Stricter rate limits (5 attempts per 15 minutes) to mitigate credential stuffing and brute-force attacks.
     - `sensitiveOpLimiter`: Protects registration and password reset endpoints.
   - **Payload Limiting**: JSON and URL-encoded bodies capped at 10 KB to prevent memory exhaustion attacks.
   - **Guaranteed Startup Sequencing**: The HTTP listener initializes **only after** MongoDB connection succeeds.

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your local values:

```ini
PORT=5000
NODE_ENV=development

# MongoDB Connection String
MONGO_URI=mongodb://127.0.0.1:27017/brightloop_subscriptions

# JSON Web Token
JWT_SECRET=brightloop_ultra_secure_jwt_secret_key_minimum_64_characters_example
JWT_EXPIRES_IN=24h

# Frontend / Client URL
CLIENT_URL=http://localhost:3000

# Nodemailer SMTP Configuration
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM="Brightloop Software <support@brightloop.com>"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=15
LOGIN_RATE_LIMIT_MAX=5
```

---

## 4. Installation & Startup Instructions

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Bootstrap Initial Admin Account
Run the interactive provisioning script:
```bash
npm run create-admin
```
Or provision non-interactively:
```bash
node scripts/createAdmin.js --name "Admin User" --email "admin@brightloop.com" --password "AdminSecretPass123!"
```

### Step 3: Run the Server
- For development with auto-reload:
  ```bash
  npm run dev
  ```
- For production:
  ```bash
  npm start
  ```

---

## 5. API Testing Guide (Manual Verification)

### 1. Health Check
```bash
curl -X GET http://localhost:5000/api/health
```
**Expected Response (200 OK):**
```json
{
  "status": "ok",
  "service": "Brightloop Subscription Management API",
  "module": "Part 1: Authentication & User Management"
}
```

---

### 2. Customer Registration (`POST /api/auth/register`)

#### Scenario A: Successful Customer Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Customer",
    "email": "jane@example.com",
    "password": "SecurePass123!"
  }'
```
**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "Account registered successfully.",
  "token": "<JWT_TOKEN>",
  "user": {
    "id": "<USER_ID>",
    "name": "Jane Customer",
    "email": "jane@example.com",
    "role": "customer",
    "isActive": true
  }
}
```

#### Scenario B: Weak Password Rejection (<= 8 characters)
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Customer",
    "email": "jane2@example.com",
    "password": "Pass1!"
  }'
```
**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Password does not meet security requirements.",
  "errors": [
    "Password must be MORE than 8 characters in length (minimum 9 characters)."
  ]
}
```

#### Scenario C: Duplicate Email Rejection
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Customer",
    "email": "jane@example.com",
    "password": "SecurePass123!"
  }'
```
**Expected Response (409 Conflict):**
```json
{
  "success": false,
  "message": "An account with this email address already exists. Please log in."
}
```

#### Scenario D: Attempted Role Privilege Escalation
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Attacker",
    "email": "attacker@example.com",
    "password": "SecurePass123!",
    "role": "admin"
  }'
```
**Expected Response (201 Created, but role remains `customer`):**
```json
{
  "success": true,
  "user": {
    "role": "customer"
  }
}
```

---

### 3. User Login (`POST /api/auth/login`)

#### Scenario A: Successful Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "SecurePass123!"
  }'
```
**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful.",
  "token": "<JWT_TOKEN>",
  "user": {
    "name": "Jane Customer",
    "email": "jane@example.com",
    "role": "customer"
  }
}
```

#### Scenario B: Invalid Credentials Rejection
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "WrongPassword123!"
  }'
```
**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "message": "Invalid email or password."
}
```

---

### 4. User Profile (`GET /api/auth/me`)

#### Scenario A: Authorized Profile Retrieval
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <CUSTOMER_JWT_TOKEN>"
```
**Expected Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "<USER_ID>",
    "name": "Jane Customer",
    "email": "jane@example.com",
    "role": "customer",
    "isActive": true
  }
}
```

#### Scenario B: Missing / Invalid Token Rejection
```bash
curl -X GET http://localhost:5000/api/auth/me
```
**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "message": "Access denied. No authorization token provided."
}
```

---

### 5. Staff Creation (`POST /api/auth/staff`)

#### Scenario A: Admin Successfully Creates Staff Account
```bash
curl -X POST http://localhost:5000/api/auth/staff \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "name": "Sam Staff",
    "email": "sam@brightloop.com",
    "password": "StaffSecretPass123!"
  }'
```
**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "Staff account created successfully.",
  "user": {
    "name": "Sam Staff",
    "email": "sam@brightloop.com",
    "role": "staff"
  }
}
```

#### Scenario B: Customer Denied Permission (403 Forbidden)
```bash
curl -X POST http://localhost:5000/api/auth/staff \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CUSTOMER_JWT_TOKEN>" \
  -d '{
    "name": "Unauthorized Staff",
    "email": "unauth@brightloop.com",
    "password": "StaffSecretPass123!"
  }'
```
**Expected Response (403 Forbidden):**
```json
{
  "success": false,
  "message": "Forbidden: Access denied. Role 'customer' is not authorized to access this resource."
}
```

---

### 6. Password Reset Flow

#### Scenario A: Request Password Reset (`POST /api/auth/forgot-password`)
```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com"
  }'
```
**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```
*(In development without live SMTP, check the server console for the dispatched reset token URL or Ethereal preview link).*

#### Scenario B: Reset Password with Token (`POST /api/auth/reset-password/:token`)
```bash
curl -X POST http://localhost:5000/api/auth/reset-password/<RESET_TOKEN> \
  -H "Content-Type: application/json" \
  -d '{
    "password": "NewUpdatedPassword123!"
  }'
```
**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Password has been reset successfully. You may now log in with your new credentials."
}
```

#### Scenario C: Reject Reused Token (Single-Use Validation)
Submitting the exact same token a second time yields:
**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Invalid or expired password reset token."
}
```

---

## 6. Postman Test Suite Import
You can directly import `backend/Brightloop_Part1_Auth_Postman_Collection.json` into Postman. It contains pre-configured tests and collection variables for automated token capture and chaining across requests.

