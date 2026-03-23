const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const crypto = require("crypto");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// 👑 حط الايدي بتاعك هنا
const ADMIN_ID = 1760401627;

// DB بسيط
let users = {};
let banned = {};
let userState = {};

// ===== توليد session =====
function generateSession() {
  return crypto.createHash("md5")
    .update(Date.now() + Math.random().toString())
    .digest("hex") + "0";
}

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  if (banned[id]) return bot.sendMessage(id, "❌ انت محظور");

  users[id] = true;

  bot.sendMessage(id, "👋 أهلاً بيك في NK AI BOT", {
    reply_markup: {
      keyboard: [
        ["🎬 تحويل لفيديو"],
        ["ℹ️ المساعدة"]
      ],
      resize_keyboard: true
    }
  });
});

// ===== MENU =====
bot.on("message", (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (banned[id]) return;

  if (text === "ℹ️ المساعدة") {
    return bot.sendMessage(id, `
📌 الاستخدام:

1. اضغط "تحويل لفيديو"
2. ابعت صورة
3. اكتب وصف
4. استلم الفيديو 🎬
`);
  }

  if (text === "🎬 تحويل لفيديو") {
    userState[id] = { step: "image" };
    return bot.sendMessage(id, "📷 ابعت الصورة");
  }
});

// ===== استقبال صورة =====
bot.on("photo", async (msg) => {
  const id = msg.chat.id;

  if (banned[id]) return;
  if (!userState[id] || userState[id].step !== "image") return;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const file = await bot.getFile(fileId);

  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  const filePath = `./${id}.jpg`;

  const res = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(filePath);
  res.data.pipe(writer);

  writer.on("finish", () => {
    userState[id] = { step: "prompt", filePath };
    bot.sendMessage(id, "✍️ اكتب وصف الفيديو");
  });
});

// ===== استقبال prompt =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;

  if (!userState[id] || userState[id].step !== "prompt") return;

  const prompt = msg.text;
  const filePath = userState[id].filePath;

  bot.sendMessage(id, "⏳ جاري إنشاء الفيديو...");

  const session = generateSession();

  try {
    // ===== get upload =====
    const upload = await axios.post(
      "https://api.pixwith.ai/api/chats/pre_url",
      { image_name: "file.jpg", content_type: "image/jpeg" },
      { headers: { "x-session-token": session } }
    );

    const s3 = upload.data.data.url;

    const form = new FormData();
    Object.entries(s3.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", fs.createReadStream(filePath));

    await axios.post(s3.url, form, { headers: form.getHeaders() });

    const key = s3.fields.key;

    // ===== create video =====
    await axios.post(
      "https://api.pixwith.ai/api/items/create",
      {
        images: { image1: key },
        prompt,
        options: {
          prompt_optimization: true,
          num_outputs: 1,
          aspect_ratio: "16:9",
          resolution: "480p",
          duration: 4,
          sound: true
        },
        model_id: "3-38"
      },
      { headers: { "x-session-token": session } }
    );

    // ===== polling =====
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 10000));

      const history = await axios.post(
        "https://api.pixwith.ai/api/items/history",
        { tool_type: "3", page: 0, page_size: 10 },
        { headers: { "x-session-token": session } }
      );

      const items = history.data?.data?.items;

      if (items && items.length) {
        const latest = items[0];

        if (latest.status === 2) {
          const vid = latest.result_urls.find(v => !v.is_input);
          if (vid) {
            bot.sendVideo(id, vid.hd);
            userState[id] = null;
            return;
          }
        }
      }
    }

    bot.sendMessage(id, "❌ الفيديو اتأخر أو فشل");

  } catch {
    bot.sendMessage(id, "❌ حصل خطأ");
  }
});

// ===== ADMIN =====

// 📊 stats
bot.onText(/\/stats/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  bot.sendMessage(msg.chat.id, `👥 عدد المستخدمين: ${Object.keys(users).length}`);
});

// 🚫 ban
bot.onText(/\/ban (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  banned[match[1]] = true;
  bot.sendMessage(msg.chat.id, "🚫 تم الحظر");
});

// ✅ unban
bot.onText(/\/unban (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  delete banned[match[1]];
  bot.sendMessage(msg.chat.id, "✅ تم فك الحظر");
});

// 📢 broadcast
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  Object.keys(users).forEach(id => {
    bot.sendMessage(id, match[1]);
  });

  bot.sendMessage(msg.chat.id, "📢 تم الإرسال");
});
