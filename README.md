# 📝 NoteNest – Note Management Web Application

A clean, responsive, full-stack note management web application built with **plain HTML, CSS, JavaScript** on the frontend, and a **Node.js + Express** backend backed by a safe, atomic, file-based database (`data/db.json`).

Developed for academic presentation (B.Tech 3rd Semester) with a clean architecture, simple code, and robust error handling.

---

## 🌟 Key Features

1. **Multi-User Authentication**: Secure registration and login using salted password hashing (`bcryptjs`) and JSON Web Tokens (`jsonwebtoken`).
2. **User Data Isolation**: Notes are strictly private—one user can never access or modify another user's notes.
3. **Full Note Lifecycle (CRUD)**:
   - Create, edit, and duplicate notes.
   - Pinned notes (pinned notes always stay on top in the main view).
   - Soft-delete Trash workflow (notes move to trash first, can be restored, or deleted permanently).
   - Archive / unarchive workflow to stash notes away without deleting them.
4. **Organization & Search**:
   - 6 pastel color themes: `yellow`, `pink`, `mint`, `sky`, `lilac`, `white`.
   - Free-form categories with live sidebar counts and autocomplete.
   - Live search debounced at 250ms across title, body, and category.
   - Sorting by: Last edited (`updated`), Newest first (`created`), or Alphabetical (`title A-Z`).
5. **Safe Atomic Storage (`data/db.json`)**:
   - No heavy database engine needed (no MySQL or MongoDB).
   - Safe promise-queued writes to prevent file corruption during concurrent requests.
   - Atomic temporary file swapping.
   - Auto-recovery: if `db.json` is corrupted, it archives a copy (`db.corrupt-<timestamp>.json`) and initializes fresh.
6. **Backup & Local Migration**:
   - Export all personal notes as a downloadable `notenest-backup.json`.
   - Import JSON backups (validates colors, skips duplicates, fills defaults).
   - One-time migration prompt for any notes previously stored in browser `localStorage`.
7. **Keyboard Shortcuts**:
   - `/`: Focus search input.
   - `Escape`: Close note editor.
   - `Ctrl+Enter` or `Cmd+Enter`: Save note immediately while typing.

---

## 📁 Project Folder Structure

```
NoteNest/
├── package.json               # Project manifest, dependencies, and test scripts
├── .env                       # Local environment variables (PORT, JWT_SECRET, etc.)
├── .env.example               # Template for environment configuration
├── .gitignore                 # Excludes node_modules, .env, and db.json from Git
├── README.md                  # Comprehensive documentation and viva guide
├── server.js                  # Application entry point (initializes DB and starts server)
├── src/
│   ├── app.js                 # Express app configuration, Helmet CSP, CORS, routes
│   ├── config.js              # Environment variable loader
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/register, /login, GET /api/auth/me
│   │   └── notes.js           # Full CRUD, categories, stats, export/import
│   ├── middleware/
│   │   ├── auth.js            # JWT verification middleware
│   │   ├── validate.js        # Input sanitization and validation
│   │   └── errorHandler.js    # Global JSON error and 404 handler
│   └── services/
│       ├── db.js              # Atomic JSON read/write queue
│       ├── userService.js     # User registration and authentication
│       └── noteService.js     # Note business logic and filtering
├── data/
│   └── db.json                # Single JSON database file (auto-generated)
├── public/
│   ├── index.html             # Clean responsive UI + Login/Register card
│   ├── style.css              # Lavender & indigo visual styling
│   ├── script.js              # Frontend UI logic and event listeners
│   └── api.js                 # Frontend API client with JWT handling
└── tests/
    └── api.test.js            # 23 automated tests using Node's built-in node:test
```

---

## 🚀 Setup and Run Instructions

### Prerequisites
* **Node.js 18 or newer** installed on your system.

### 1. Installation
Open your terminal inside the `NoteNest` directory and install dependencies:
```bash
npm install
```

### 2. Configure Environment
A `.env` file is included. To customize port or secret:
```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

### 3. Run Automated Tests
Run the comprehensive 23-test test suite:
```bash
npm test
```
All tests use Node's native `node:test` and `node:assert` runner (no external test runner needed).

### 4. Start the Application
Start the server:
```bash
npm start
```
For auto-reloading during development:
```bash
npm run dev
```

Open your browser and navigate to:
👉 **`http://localhost:3000`**

---

## 🌐 API Endpoints Reference

All endpoints return standard JSON:
* **Success**: `{ "success": true, "data": ... }`
* **Error**: `{ "success": false, "error": { "code": "ERROR_CODE", "message": "Readable description" } }`

### Authentication Routes (Rate-limited to 20 requests / 15 min)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | No | Creates a new user (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | No | Authenticates user and returns JWT token |
| `GET` | `/api/auth/me` | Yes | Returns current logged-in user profile |

### Notes Routes (Require `Authorization: Bearer <token>`)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | No | Server health check (`{ "status": "ok" }`) |
| `GET` | `/api/notes` | Yes | List notes (`?view=all\|pinned\|archive\|trash&cat=&q=&sort=`) |
| `GET` | `/api/notes/stats` | Yes | Sidebar counts: `{ all, pinned, archive, trash }` |
| `GET` | `/api/notes/categories` | Yes | Non-trashed category counts, sorted A-Z |
| `POST` | `/api/notes` | Yes | Create active note (`title`, `body`, `cat`, `color`) |
| `PUT` | `/api/notes/:id` | Yes | Update note content (returns 409 if note is in trash) |
| `PATCH` | `/api/notes/:id` | Yes | Update `pinned` and/or `status` (trashing auto-clears pin) |
| `POST` | `/api/notes/:id/duplicate` | Yes | Creates `<title> (copy)`, unpinned, new timestamps |
| `DELETE` | `/api/notes/trash` | Yes | Permanently empties all trashed notes for user |
| `DELETE` | `/api/notes/:id` | Yes | Permanently deletes a note (allowed ONLY if in trash, else 409) |
| `GET` | `/api/notes/export` | Yes | Downloads all user notes as `notenest-backup.json` |
| `POST` | `/api/notes/import` | Yes | Imports array of notes (skips duplicates/invalid) |

---

## 📋 JSON Object Schemas

### User Object (`data/db.json`)
```json
{
  "id": "7f8b9a12-3c4d-4e5f-a6b7-8c9d0e1f2a3b",
  "name": "Alex Sharma",
  "email": "alex@college.edu",
  "passwordHash": "$2a$10$e7Q8u...",
  "createdAt": 1761800000000
}
```
*(Note: `passwordHash` is never sent over the API).*

### Note Object (`data/db.json`)
```json
{
  "id": "k3x9a1b",
  "userId": "7f8b9a12-3c4d-4e5f-a6b7-8c9d0e1f2a3b",
  "title": "Exam prep",
  "body": "Revise chapters 4-6",
  "cat": "Study",
  "color": "sky",
  "pinned": true,
  "status": "active",
  "created": 1761800000000,
  "updated": 1761800000000
}
```

---

## 🔒 Security Notes & Limitations

To be completely honest and transparent during your evaluation:

### What Is Included:
* **Bcrypt Password Hashing**: Passwords are salted and hashed with 10 rounds before storing. Plain text passwords are never stored or logged.
* **JWT Authentication**: Stateless, signed tokens verify user identity on every API request.
* **User Data Isolation**: Every note operation strictly checks `n.userId === req.user.id`.
* **Rate Limiting**: Auth routes limit abuse with `express-rate-limit`.
* **HTTP Security Headers**: `helmet` is configured with a strict Content Security Policy allowing Google Fonts.
* **Safe Atomic Disk Writes**: Concurrency protection prevents `data/db.json` file corruption.

### What Is NOT Included (Future Scope):
1. **HTTPS / TLS**: The app runs on standard HTTP for local development. In production, an SSL/TLS certificate (e.g. Let's Encrypt or Cloudflare) should terminate HTTPS.
2. **Password Reset / Email Verification**: No SMTP mail server is integrated; forgot password flows are omitted to keep the project lightweight.
3. **Database Scalability**: Storing everything in a single `db.json` file is ideal for college projects, single-instance apps, and portfolios, but enterprise apps with tens of thousands of users would benefit from PostgreSQL or MongoDB.

---

## 🎓 Viva Questions & Answers (Preparation Guide)

1. **Q: Why did you use `bcryptjs` instead of storing plain-text passwords or using MD5/SHA256?**
   * *A:* MD5 and SHA-256 are fast hash functions prone to rainbow table attacks. `bcrypt` uses an adaptive salt and slow hashing algorithm specifically designed for passwords, making brute-force attacks computationally infeasible.

2. **Q: How does the application prevent race conditions when two users write to `db.json` simultaneously?**
   * *A:* In `src/services/db.js`, all file writes are sequenced through a JavaScript Promise queue (`writeQueue = writeQueue.then(...)`). Additionally, we write to a temporary file first and atomically rename it over `db.json`.

3. **Q: What is the purpose of JWT (JSON Web Token) in this project?**
   * *A:* JWT allows stateless authentication. After login, the server issues a signed token containing the user's ID. The client sends this token in the `Authorization: Bearer <token>` header for subsequent requests, eliminating the need to query session tables in memory or disk.

4. **Q: How are soft deletes implemented for the Trash feature?**
   * *A:* Instead of immediately removing a note from `db.json`, the server updates its `status` field to `'trashed'` and resets `pinned: false`. The note is only permanently deleted when the user triggers "Delete Forever" or "Empty Trash".

5. **Q: How is user isolation enforced?**
   * *A:* Every note in `db.json` stores a `userId`. All operations (queries, updates, deletes) filter by `req.user.id` extracted from the verified JWT. Attempting to access another user's note returns a 404 Not Found.
