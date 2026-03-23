const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = 1760401627; // 🔥 حط الايدي بتاعك هنا

let users = {};
let banned = {};
let userState = {};

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  if (banned[id]) return bot.sendMessage(id, "❌ انت محظور");

  users[id] = true;

  bot.sendMessage(id, "👋 أهلا بيك في NK AI BOT", {
    reply_markup: {
      keyboard: [
        ["🎨 توليد صورة"],
        ["🎬 تحويل لفيديو"],
        ["ℹ️ المساعدة"]
      ],
      resize_keyboard: true
    }
  });
});

// ===== MENU =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (banned[id]) return;

  if (text === "ℹ️ المساعدة") {
    return bot.sendMessage(id, `
📌 الاستخدام:

🎨 توليد صورة:
- اكتب وصف → تستلم صورة

🎬 فيديو:
- ابعت صورة
- اكتب وصف
- تستلم فيديو
`);
  }

  if (text === "🎨 توليد صورة") {
    userState[id] = { mode: "image" };
    return bot.sendMessage(id, "✍️ اكتب وصف الصورة");
  }

  if (text === "🎬 تحويل لفيديو") {
    userState[id] = { mode: "video_wait_image" };
    return bot.sendMessage(id, "📷 ابعت الصورة الأول");
  }
});

// ===== IMAGE GENERATION =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;

  if (!userState[id] || userState[id].mode !== "image") return;

  const prompt = msg.text;

  bot.sendMessage(id, "⏳ جاري توليد الصورة...");

  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`
        },
        responseType: "arraybuffer"
      }
    );

    const img = Buffer.from(res.data, "binary");

    bot.sendPhoto(id, img);

  } catch {
    bot.sendMessage(id, "❌ فشل التوليد");
  }

  userState[id] = null;
});

// ===== RECEIVE IMAGE =====
bot.on("photo", async (msg) => {
  const id = msg.chat.id;

  if (!userState[id] || userState[id].mode !== "video_wait_image") return;

  const fileId = msg.photo[msg.photo.length - 1].file_id;

  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

  const response = await axios.get(url, { responseType: "arraybuffer" });

  const filePath = `./temp_${id}.jpg`;
  fs.writeFileSync(filePath, response.data);

  userState[id] = {
    mode: "video_wait_prompt",
    image: filePath
  };

  bot.sendMessage(id, "✍️ اكتب وصف الفيديو");
});

// ===== VIDEO GENERATION (Fake Demo) =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;

  if (!userState[id] || userState[id].mode !== "video_wait_prompt") return;

  const prompt = msg.text;

  bot.sendMessage(id, "⏳ جاري إنشاء الفيديو...");

  try {
    // 🔥 هنا ممكن تربطه بـ Pixwith
    await new Promise(r => setTimeout(r, 5000));

    bot.sendMessage(id, "🎬 الفيديو:");
    bot.sendMessage(id, "https://example.com/video.mp4");

  } catch {
    bot.sendMessage(id, "❌ فشل الفيديو");
  }

  userState[id] = null;
});

// ===== ADMIN =====
bot.onText(/\/stats/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  bot.sendMessage(msg.chat.id, `👥 المستخدمين: ${Object.keys(users).length}`);
});

bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  Object.keys(users).forEach(id => {
    bot.sendMessage(id, match[1]);
  });
});

bot.onText(/\/ban (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  banned[match[1]] = true;
  bot.sendMessage(msg.chat.id, "🚫 تم الحظر");
});
