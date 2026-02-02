import http from "http";
import { request } from "undici";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === Config ===
const PORT = process.env.PORT || 3000;
const TOKEN_DIR = "./data";
const TOKEN_FILE = join(TOKEN_DIR, "tokens.json");
const VALID_TOKEN_REGEX = /^[0-9]{7,10}:[a-zA-Z0-9_-]{30,}$/;

// === Persistent Token Storage ===
let tokens = new Set();

function loadTokens() {
  if (!existsSync(TOKEN_DIR)) mkdirSync(TOKEN_DIR);
  if (existsSync(TOKEN_FILE)) {
    try {
      const stored = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
      if (Array.isArray(stored)) tokens = new Set(stored);
    } catch (e) {
      console.error("Failed to load tokens.json:", e);
    }
  }
}

function saveTokens() {
  writeFileSync(TOKEN_FILE, JSON.stringify([...tokens]), "utf8");
}

loadTokens();

// === Fixed Message Content ===
const PHOTO = "https://graph.org/file/81bfc92532eb6ce8f467a-4cdb9832784225218b.jpg";
const CAPTION = "<b>🔥 New MMS LEAKS ARE OUT!</b>\nClick any server below 👇";
const BUTTONS = [
  { text: "VIDEOS💦", url: "https://t.me/+NiLqtvjHQoFhZjQ1" },
  { text: "FILES🍑", url: "https://t.me/+fvFJeSbZEtc2Yjg1" }
];

// === Send Photo with Buttons ===
async function sendPhoto(token, chat_id) {
  try {
    await request(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        photo: PHOTO,
        caption: CAPTION,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: BUTTONS[0].text, url: BUTTONS[0].url },
            { text: BUTTONS[1].text, url: BUTTONS[1].url }
          ]]
        }
      }),
    });
  } catch (e) {
    console.error("Failed to send photo:", e);
  }
}

// === Web Server ===
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const token = url.searchParams.get("token");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    // === Register Bot Token via /register?token=xxx ===
    if (path === "/register" && token) {
      if (!VALID_TOKEN_REGEX.test(token)) {
        res.writeHead(400);
        res.end("❌ Invalid bot token format");
        return;
      }

      tokens.add(token);
      saveTokens();

      const webhookUrl = `https://${req.headers.host}/bot${token}`;
      await request(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ url: webhookUrl }).toString(),
      });

      res.writeHead(200);
      res.end("✅ Bot registered & webhook set.");
      return;
    }

    // === Unregister Bot Token via /unregister?token=xxx ===
    if (path === "/unregister" && token) {
      if (!tokens.has(token)) {
        res.writeHead(404);
        res.end("❌ Token not found");
        return;
      }

      tokens.delete(token);
      saveTokens();

      await request(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: "POST",
      });

      res.writeHead(200);
      res.end("✅ Bot unregistered & webhook removed.");
      return;
    }

    // === Handle Telegram Webhook ===
    if (path.startsWith("/bot")) {
      const botToken = path.slice(4);
      if (!tokens.has(botToken)) {
        res.writeHead(401);
        res.end("⛔ Unauthorized");
        return;
      }

      if (req.method === "POST") {
        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const update = JSON.parse(body);
            const chat_id = update?.message?.chat?.id;
            if (chat_id) await sendPhoto(botToken, chat_id);
            res.writeHead(200);
            res.end("ok");
          } catch (e) {
            console.error("Error processing webhook:", e);
            res.writeHead(200);
            res.end("ok");
          }
        });
        return;
      } else {
        res.writeHead(405);
        res.end("⛔ Method Not Allowed");
        return;
      }
    }

    res.writeHead(404);
    res.end("❓ Not Found");
  } catch (err) {
    console.error("Error in handler:", err);
    res.writeHead(500);
    res.end("🚨 Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`✅ Bot server is live on port ${PORT}`);
});
