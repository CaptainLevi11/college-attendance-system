
require('dotenv').config()
const express = require("express")
const mysql = require("mysql2")
const bodyParser = require("body-parser")
const cors = require("cors")
const { OAuth2Client } = require('google-auth-library')
const crypto = require("crypto")

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "attendance_session"
const SESSION_TIMEOUT_SECONDS = Number(process.env.SESSION_TIMEOUT_SECONDS || 15)
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_SECONDS * 1000
const PASSWORD_ITERATIONS = 120000
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true"

const app = express()
app.disable("x-powered-by")
app.set("trust proxy", 1)

// Add Cross-Origin-Opener-Policy for Google Identity Services popup
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
})

const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true)
        }
        callback(new Error("Not allowed by CORS"))
    },
    credentials: true
}))
app.use(bodyParser.json())

// Serve the login page on the root URL
const path = require("path");
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/dashboard.html", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("/signup.html", (req, res) => {
    res.sendFile(path.join(__dirname, "signup.html"));
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" })
})

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "Hello@1",
    database: process.env.DB_NAME || "attendance_system",
    waitForConnections: true,
    connectionLimit: 10
})
const dbp = db.promise()

async function initializeDatabase() {
    try {
        await dbp.query("SELECT 1")
        await dbp.query(`
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_hash CHAR(64) NOT NULL UNIQUE,
                user_id INT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NULL,
                last_seen_at DATETIME NULL,
                INDEX idx_auth_sessions_user_id (user_id),
                INDEX idx_auth_sessions_expires_at (expires_at),
                CONSTRAINT fk_auth_sessions_user
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `)
        console.log("Database Connected")
    } catch (err) {
        console.error("Database connection failed. Database features will not work until MySQL/config is fixed:", err.message)
    }
}

initializeDatabase()

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function hashValue(value) {
    return crypto.createHash("sha256").update(value).digest("hex")
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, "sha512").toString("hex")
    return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`
}

function verifyPassword(password, storedPassword) {
    if (!storedPassword) return false
    if (!storedPassword.startsWith("pbkdf2$")) {
        return storedPassword === password
    }

    const [, iterations, salt, storedHash] = storedPassword.split("$")
    if (!iterations || !salt || !storedHash) return false

    const hash = crypto.pbkdf2Sync(password, salt, Number(iterations), 64, "sha512").toString("hex")
    if (hash.length !== storedHash.length) return false
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"))
}

function parseCookies(req) {
    return (req.headers.cookie || "").split(";").reduce((cookies, part) => {
        const [rawName, ...rawValue] = part.trim().split("=")
        if (!rawName) return cookies
        cookies[rawName] = decodeURIComponent(rawValue.join("="))
        return cookies
    }, {})
}

function getSessionToken(req) {
    return parseCookies(req)[SESSION_COOKIE_NAME]
}

function getCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: COOKIE_SECURE,
        maxAge: SESSION_TIMEOUT_MS,
        path: "/"
    }
}

function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: COOKIE_SECURE,
        path: "/"
    })
}

async function createSession(res, userId) {
    const token = crypto.randomBytes(32).toString("hex")
    const sessionHash = hashValue(token)
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MS)

    await dbp.query(
        "INSERT INTO auth_sessions(session_hash, user_id, expires_at) VALUES (?, ?, ?)",
        [sessionHash, userId, expiresAt]
    )

    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions())
    return expiresAt
}

async function getActiveSession(req) {
    const token = getSessionToken(req)
    if (!token) return null

    const sessionHash = hashValue(token)
    const [rows] = await dbp.query(
        `SELECT s.session_hash, s.user_id, s.expires_at, u.id, u.user_id AS public_user_id,
                u.google_id, u.email, u.name, u.role
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.session_hash = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > NOW()
         LIMIT 1`,
        [sessionHash]
    )

    if (!rows.length) return null

    await dbp.query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE session_hash = ?", [sessionHash])
    const row = rows[0]
    return {
        sessionHash,
        expiresAt: row.expires_at,
        user: {
            id: row.id,
            user_id: row.public_user_id,
            google_id: row.google_id,
            email: row.email,
            name: row.name,
            role: row.role
        }
    }
}

async function requireSession(req, res, next) {
    try {
        const session = await getActiveSession(req)
        if (!session) {
            clearSessionCookie(res)
            return res.status(401).json({ success: false, message: "Session expired. Please log in again." })
        }
        req.session = session
        next()
    } catch (err) {
        console.error("Session check failed:", err.message)
        res.status(500).json({ success: false, message: "Session check failed" })
    }
}

const sessionStreams = new Map()

function sendSessionEvent(sessionHash, event, data) {
    const streams = sessionStreams.get(sessionHash)
    if (!streams) return

    for (const stream of streams) {
        stream.write(`event: ${event}\n`)
        stream.write(`data: ${JSON.stringify(data)}\n\n`)
    }
}

async function revokeSession(sessionHash, reason = "logout") {
    await dbp.query(
        "UPDATE auth_sessions SET revoked_at = NOW() WHERE session_hash = ? AND revoked_at IS NULL",
        [sessionHash]
    )
    sendSessionEvent(sessionHash, "logout", { reason })
}

setInterval(async () => {
    for (const sessionHash of sessionStreams.keys()) {
        try {
            const [rows] = await dbp.query(
                "SELECT revoked_at, expires_at <= NOW() AS expired FROM auth_sessions WHERE session_hash = ? LIMIT 1",
                [sessionHash]
            )
            if (!rows.length || rows[0].revoked_at || rows[0].expired) {
                sendSessionEvent(sessionHash, "logout", {
                    reason: rows.length && rows[0].expired ? "expired" : "logout"
                })
            }
        } catch (err) {
            console.error("Session stream check failed:", err.message)
        }
    }
}, 1000)

app.post("/api/auth/google", async (req, res) => {
    try {
        const { credential } = req.body;
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: google_id, email, name } = payload;

        const [existingUsers] = await dbp.query(
            "SELECT * FROM users WHERE google_id = ? OR email = ?",
            [google_id, email]
        );

        if (existingUsers.length > 0) {
            const user = existingUsers[0];
            if (!user.google_id) {
                await dbp.query("UPDATE users SET google_id = ? WHERE email = ?", [google_id, email]);
                user.google_id = google_id;
            }

            await createSession(res, user.id);
            return res.json({ success: true, user, isNewUser: false });
        }

        const gen_user_id = "g_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36).substr(-4);
        const [insertResult] = await dbp.query(
            "INSERT INTO users(user_id, google_id, email, name, role) VALUES (?, ?, ?, ?, 'Student')",
            [gen_user_id.substring(0, 20), google_id, email, name]
        );
        const [newUsers] = await dbp.query("SELECT * FROM users WHERE id = ?", [insertResult.insertId]);

        await createSession(res, newUsers[0].id);
        res.json({ success: true, user: newUsers[0], isNewUser: true });
    } catch (error) {
        console.error("Error verifying Google token:", error);
        res.status(401).json({ success: false, message: "Invalid token" });
    }
});

app.post("/login", async (req, res) => {
    const { email, password, role } = req.body

    try {
        const [result] = await dbp.query("SELECT * FROM users WHERE email=?", [email])

        if (!result.length) {
            return res.json({ success: false, message: "User not found. Please register." })
        }

        const user = result[0]
        if (role && user.role !== role) {
            return res.json({ success: false, message: `This account is registered as ${user.role}.` })
        }

        if (!verifyPassword(password, user.password)) {
            return res.json({ success: false, message: "Incorrect password" })
        }

        if (!user.password.startsWith("pbkdf2$")) {
            await dbp.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword(password), user.id])
        }

        await createSession(res, user.id)
        res.json({ success: true, user })
    } catch (err) {
        console.error("Login DB Error:", err.message)
        res.status(500).json({ success: false, message: "Database Error: " + err.message })
    }
})

app.post("/signup", (req, res) => {
    const { name, email, password, role } = req.body;
    const checkSql = "SELECT * FROM users WHERE email = ?";
    db.query(checkSql, [email], (err, result) => {
        if (err) {
            console.error("Signup DB Error:", err.message);
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        if (result.length > 0) {
            return res.json({ success: false, message: "Email already registered." });
        }
        
        const gen_user_id = "g_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36).substr(-4);
        const insertSql = "INSERT INTO users(user_id, email, password, name, role) VALUES (?, ?, ?, ?, ?)";
        
        db.query(insertSql, [gen_user_id.substring(0, 20), email, hashPassword(password), name, role], (err, insertResult) => {
            if (err) {
                console.error("Error registering user in DB:", err.message);
                return res.status(500).json({ success: false, message: "Error registering new user" });
            }
            res.json({ success: true });
        });
    });
});

app.get("/api/session", requireSession, (req, res) => {
    res.json({ success: true, valid: true, user: req.session.user, expiresAt: req.session.expiresAt })
})

app.post("/api/verify-token", async (req, res) => {
    try {
        const session = await getActiveSession(req)
        res.json({ valid: Boolean(session), user: session ? session.user : null })
    } catch (err) {
        res.json({ valid: false })
    }
})

app.post("/logout", requireSession, async (req, res) => {
    try {
        await revokeSession(req.session.sessionHash, "logout")
        clearSessionCookie(res)
        res.json({ success: true })
    } catch (err) {
        console.error("Logout failed:", err.message)
        res.status(500).json({ success: false, message: "Logout failed" })
    }
})

app.get("/api/session/events", requireSession, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders?.()

    const sessionHash = req.session.sessionHash
    if (!sessionStreams.has(sessionHash)) {
        sessionStreams.set(sessionHash, new Set())
    }

    const streams = sessionStreams.get(sessionHash)
    streams.add(res)

    res.write(`event: connected\n`)
    res.write(`data: ${JSON.stringify({ ok: true })}\n\n`)

    req.on("close", () => {
        streams.delete(res)
        if (streams.size === 0) {
            sessionStreams.delete(sessionHash)
        }
    })
})

app.post("/markAttendance", (req, res) => {

    const { student_id, subject, date, status } = req.body

    const sql = "INSERT INTO attendance(student_id,subject,date,status) VALUES (?,?,?,?)"

    db.query(sql, [student_id, subject, date, status], (err, result) => {

        if (err) throw err

        res.json({ message: "Attendance Marked" })

    })

})

app.get("/attendance/:student_id", (req, res) => {

    const student_id = req.params.student_id

    const sql = "SELECT * FROM attendance WHERE student_id=?"

    db.query(sql, [student_id], (err, result) => {

        if (err) {
            console.error("Fetch Attendance DB Error:", err.message);
            return res.status(500).json({ error: "Database Error: " + err.message });
        }

        res.json(result)

    })

})

const ports = (process.env.PORTS || process.env.PORT || "3000,3001")
    .toString()
    .split(",")
    .map(port => Number(port.trim()))
    .filter(Boolean)

for (const port of [...new Set(ports)]) {
    const server = app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`)
    })

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${port} is already in use.`)
            console.error(`Stop the existing server or run with different ports, for example: PORTS=4000,4001 npm start`)
            process.exit(1)
        }

        console.error(`Failed to start server on port ${port}:`, err.message)
        process.exit(1)
    })
}
