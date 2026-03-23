const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const crypto = require("crypto");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// تخزين مؤقت
let userState = {};

function generateSession() {
  return crypto.createHash("md5")
    .update(Date.now() + Math.random().toString())
    .digest("hex") + "0";
}

async function getUploadUrl(session) {
  try {
    const res = await axios.post(
      "https://api.pixwith.ai/api/chats/pre_url",
      {
        image_name: "file.jpg",
        content_type: "image/jpeg"
      },
      {
        headers: {
          "x-session-token": session,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  } catch {
    return null;
  }
}

async function uploadImage(uploadData, filePath) {
  try {
    const s3 = uploadData.data.url;
    const form = new FormData();

    Object.entries(s3.fields).forEach(([k, v]) => {
      form.append(k, v);
    });

    form.append("file", fs.createReadStream(filePath));

    const res = await axios.post(s3.url, form, {
      headers: form.getHeaders()
    });

    if (res.status === 204 || res.status === 200) {
      return s3.fields.key;
    }

    return null;
  } catch {
    return null;
  }
}

async function createVideo(session, key, prompt) {
  try {
    const res = await axios.post(
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
      {
        headers: {
          "x-session-token": session,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  } catch {
    return null;
  }
}

async function checkResult(session) {
  try {
    const res = await axios.post(
      "https://api.pixwith.ai/api/items/history",
      {
        tool_type: "3",
        page: 0,
        page_size: 10
      },
      {
        headers: {
          "x-session-token": session,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data;
  } catch {
    return null;
  }
}

// ===== START =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🔥 ابعت صورة عشان احولها لفيديو");
});

// ===== استقبال صورة =====
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

  const filePath = `./${chatId}.jpg`;
  const response = await axios.get(fileUrl, { responseType: "stream" });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  writer.on("finish", () => {
    userState[chatId] = { filePath };
    bot.sendMessage(chatId, "✍️ اكتب وصف الفيديو");
  });
});

// ===== استقبال النص =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!userState[chatId] || !msg.text) return;

  const prompt = msg.text;
  const filePath = userState[chatId].filePath;

  bot.sendMessage(chatId, "⏳ جاري إنشاء الفيديو...");

  const session = generateSession();

  const upload = await getUploadUrl(session);
  if (!upload) return bot.sendMessage(chatId, "❌ فشل");

  const key = await uploadImage(upload, filePath);
  if (!key) return bot.sendMessage(chatId, "❌ فشل رفع الصورة");

  const create = await createVideo(session, key, prompt);
  if (!create) return bot.sendMessage(chatId, "❌ فشل التوليد");

  // انتظار النتيجة
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 10000));

    const history = await checkResult(session);
    const items = history?.data?.items;

    if (items && items.length > 0) {
      const latest = items[0];

      if (latest.status === 2) {
        const video = latest.result_urls.find(v => !v.is_input);

        if (video) {
          bot.sendVideo(chatId, video.hd);
          delete userState[chatId];
          return;
        }
      }
    }
  }

  bot.sendMessage(chatId, "❌ فشل أو تأخير");
});
