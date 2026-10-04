const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const DATA_DIR = process.env.DATA_DIR || "/var/data";
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const SECRET = process.env.SESSION_SECRET || "CHANGE_ME_IN_RENDER";
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).slice(0, 20);
      const base = path.basename(file.originalname, safeExt)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 100) || "file";
      cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${base}${safeExt}`);
    }
  }),
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE_MB || 500) * 1024 * 1024,
    files: 20
  }
});

function requireConfig(req, res, next) {
  if (!ADMIN_PASSWORD_HASH || SECRET === "CHANGE_ME_IN_RENDER") {
    return res.status(500).send("Server is not configured. Set ADMIN_PASSWORD_HASH and SESSION_SECRET.");
  }
  next();
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.admin_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(token, SECRET);
    if (payload.user !== ADMIN_USER || payload.role !== "admin") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function safeFileFromParam(name) {
  const decoded = decodeURIComponent(name);
  if (decoded !== path.basename(decoded)) return null;
  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) return null;
  return decoded;
}

function publicFiles() {
  return fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => {
      const filename = e.name;
      const stat = fs.statSync(path.join(UPLOAD_DIR, filename));
      return {
        id: filename,
        name: filename.replace(/^\d+-[a-f0-9]+-/, ""),
        size: stat.size,
        uploadedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

app.get("/api/files", (_req, res) => {
  res.json(publicFiles());
});

app.get("/api/admin/me", requireConfig, requireAdmin, (_req, res) => {
  res.json({ username: ADMIN_USER });
});

app.post("/api/admin/login", requireConfig, async (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || !password) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Invalid username or password" });

  const token = jwt.sign({ user: ADMIN_USER, role: "admin" }, SECRET, { expiresIn: "8h" });
  res.cookie("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie("admin_token");
  res.json({ ok: true });
});

app.post("/api/admin/upload", requireConfig, requireAdmin, upload.array("files"), (req, res) => {
  res.json({
    ok: true,
    files: (req.files || []).map(f => ({ name: f.originalname, storedAs: f.filename, size: f.size }))
  });
});

app.delete("/api/admin/files/:id", requireConfig, requireAdmin, (req, res) => {
  const filename = safeFileFromParam(req.params.id);
  if (!filename) return res.status(400).json({ error: "Invalid file name" });
  const target = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(target)) return res.status(404).json({ error: "File not found" });
  fs.unlinkSync(target);
  res.json({ ok: true });
});

app.get("/download/:id", (req, res) => {
  const filename = safeFileFromParam(req.params.id);
  if (!filename) return res.status(400).send("Invalid file");
  const target = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(target)) return res.status(404).send("File not found");
  res.download(target, filename.replace(/^\d+-[a-f0-9]+-/, ""));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Debu File running on port ${PORT}`);
});
