const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs-extra");
const { exec } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const axios = require("axios");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

const BOTS_DIR = path.join(__dirname, "bots");
fs.ensureDirSync(BOTS_DIR);

// حفظ بيانات المستخدمين والبوتات
const DB_FILE = path.join(__dirname, "db.json");
if (!fs.existsSync(DB_FILE)) fs.writeJsonSync(DB_FILE, { bots: [] });

function loadDB() {
  return fs.readJsonSync(DB_FILE);
}
function saveDB(data) {
  fs.writeJsonSync(DB_FILE, data, { spaces: 2 });
}

// تحقق من صحة التوكن وعرض معلومات البوت
async function validateToken(token) {
  try {
    const res = await axios.get("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` }
    });
    return res.data;
  } catch {
    return null;
  }
}

// رفع كود بوت جديد
const upload = multer({ dest: path.join(BOTS_DIR, "uploads") });

app.post("/api/add-bot", async (req, res) => {
  const { token, code } = req.body;
  if (!token || !code) return res.status(400).json({ error: "البيانات ناقصة" });

  const info = await validateToken(token);
  if (!info || !info.bot) return res.status(403).json({ error: "توكن غير صحيح" });

  const botID = uuidv4();
  const botDir = path.join(BOTS_DIR, botID);
  fs.ensureDirSync(botDir);
  const codeFile = path.join(botDir, "bot.js");
  fs.writeFileSync(codeFile, code, "utf8");

  // حفظ البيانات
  const db = loadDB();
  db.bots.push({
    id: botID,
    token,
    username: info.username,
    avatar: info.avatar,
    user_id: info.id,
    code_path: "bot.js",
    created_at: Date.now()
  });
  saveDB(db);

  // شغل البوت (PM2 أو child_process)
  fs.writeFileSync(path.join(botDir, ".env"), `BOT_TOKEN=${token}`);
  exec(`npx pm2 start ${codeFile} --name ${botID} --env BOT_TOKEN=${token}`, (err, stdout, stderr) => {
    if (err) console.error(stderr);
  });

  res.json({
    success: true,
    botID,
    username: info.username,
    avatar: `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}.png`
  });
});

// جلب كل البوتات
app.get("/api/bots", (req, res) => {
  const db = loadDB();
  res.json(db.bots.map(bot => ({
    id: bot.id,
    username: bot.username,
    avatar: bot.avatar,
    user_id: bot.user_id,
    created_at: bot.created_at
  })));
});

// جلب كود بوت معين
app.get("/api/bot/:id/code", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const bot = db.bots.find(b => b.id === id);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  const codeFile = path.join(BOTS_DIR, id, bot.code_path);
  if (!fs.existsSync(codeFile)) return res.status(404).json({ error: "Code file not found" });
  res.download(codeFile, "bot.js");
});

// حذف بوت
app.delete("/api/bot/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const idx = db.bots.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  // اغلاق البوت
  exec(`npx pm2 delete ${id}`, () => {});
  fs.removeSync(path.join(BOTS_DIR, id));
  db.bots.splice(idx, 1);
  saveDB(db);
  res.json({ success: true });
});

// صفحة رئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
