import telebot
from telebot import types
import requests
import urllib3
import json
import os

urllib3.disable_warnings()

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = 1760401627

bot = telebot.TeleBot(BOT_TOKEN)

# ===== DB =====
if not os.path.exists("users.json"):
    with open("users.json", "w") as f:
        json.dump([], f)

if not os.path.exists("banned.json"):
    with open("banned.json", "w") as f:
        json.dump([], f)

def get_users():
    return json.load(open("users.json"))

def save_users(u):
    json.dump(u, open("users.json", "w"))

def get_banned():
    return json.load(open("banned.json"))

def save_banned(b):
    json.dump(b, open("banned.json", "w"))

# ===== STYLES =====
STYLES = [
    ("diversity", "التنوع — Diversity"),
    ("hyper-realistic", "واقعي — Hyper Realistic"),
    ("impressionist", "انطباعي — Impressionist"),
    ("low-poly", "Low Poly"),
    ("isometric", "Isometric"),
    ("cyberpunk", "Cyberpunk"),
    ("baroque", "Baroque"),
    ("abstract-expressionism", "Abstract"),
    ("photorealistic-cgi", "CGI"),
    ("surrealist", "Surreal")
]

SIZES = [
    ("SQUARE_HD", "1:1"),
    ("PORTRAIT_4_3", "3:4"),
    ("PORTRAIT_16_9", "9:16"),
    ("LANDSCAPE_4_3", "4:3"),
    ("LANDSCAPE_16_9", "16:9")
]

user_state = {}
user_data = {}

# ===== TOKEN =====
def get_token():
    headers = {
        'Content-Type': 'application/json',
        'X-Android-Package': 'com.photoroom.app',
        'X-Android-Cert': '0424A4898A4B33940D8BF16E44251B876E97F8D0',
        'User-Agent': 'Dalvik/2.1.0',
    }

    params = {'key': 'AIzaSyAJGrgbFGB_-h8V2oJLr4b-_ipetqM0duU'}

    r = requests.post(
        'https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser',
        headers=headers,
        params=params,
        json={'clientType': 'CLIENT_TYPE_ANDROID'}
    ).json()

    return r.get("idToken")

# ===== توليد الصور (معدلة صح) =====
def generate_images(prompt, styleId, sizeId):
    try:
        token = get_token()

        headers = {
            'Authorization': token,
            'Content-Type': 'application/json',
        }

        payload = {
            "userPrompt": prompt,
            "appId": "expert",
            "styleId": styleId,
            "sizeId": sizeId,
            "numberOfImages": 4
        }

        resp = requests.post(
            "https://serverless-api.photoroom.com/v2/ai-tools/generate-images",
            headers=headers,
            json=payload,
            verify=False
        )

        data = resp.json()

        images = []

        if "data" in data:
            for item in data["data"]:
                if "imageUrl" in item:
                    images.append(item["imageUrl"])

        return images

    except Exception as e:
        print("ERROR:", e)
        return []

# ===== START =====
@bot.message_handler(commands=['start'])
def start(msg):
    uid = msg.from_user.id

    if uid in get_banned():
        return bot.send_message(uid, "❌ انت محظور")

    users = get_users()
    if uid not in users:
        users.append(uid)
        save_users(users)

    kb = types.InlineKeyboardMarkup()
    for st_id, st_name in STYLES:
        kb.add(types.InlineKeyboardButton(st_name, callback_data=f"style:{st_id}"))

    bot.send_message(uid, "👋 اختار ستايل الصورة:", reply_markup=kb)

# ===== اختيار ستايل =====
@bot.callback_query_handler(func=lambda c: c.data.startswith("style:"))
def choose_size(call):
    uid = call.from_user.id
    styleId = call.data.split(":")[1]
    user_data[uid] = {"styleId": styleId}

    kb = types.InlineKeyboardMarkup()
    for sz_id, sz_name in SIZES:
        kb.add(types.InlineKeyboardButton(sz_name, callback_data=f"size:{sz_id}"))

    bot.edit_message_text("اختار القياس:", call.message.chat.id, call.message.message_id, reply_markup=kb)

# ===== اختيار المقاس =====
@bot.callback_query_handler(func=lambda c: c.data.startswith("size:"))
def ask_prompt(call):
    uid = call.from_user.id
    sizeId = call.data.split(":")[1]
    user_data[uid]["sizeId"] = sizeId
    user_state[uid] = "await_prompt"

    bot.edit_message_text("✍️ اكتب البرومبت:", call.message.chat.id, call.message.message_id)

# ===== التوليد =====
@bot.message_handler(func=lambda m: user_state.get(m.from_user.id) == "await_prompt")
def handle_prompt(msg):
    uid = msg.from_user.id

    if uid in get_banned():
        return

    prompt = msg.text
    styleId = user_data[uid]["styleId"]
    sizeId = user_data[uid]["sizeId"]

    bot.send_message(uid, "⏳ جاري التوليد...")

    imgs = generate_images(prompt, styleId, sizeId)

    if not imgs:
        bot.send_message(uid, "❌ حصل مشكلة في التوليد")
    else:
        for url in imgs:
            try:
                bot.send_photo(uid, url)
            except:
                bot.send_message(uid, url)

    user_state.pop(uid, None)

# ===== ADMIN =====
@bot.message_handler(commands=['stats'])
def stats(msg):
    if msg.from_user.id != ADMIN_ID:
        return
    bot.send_message(msg.chat.id, f"👥 المستخدمين: {len(get_users())}")

@bot.message_handler(commands=['ban'])
def ban(msg):
    if msg.from_user.id != ADMIN_ID:
        return
    try:
        uid = int(msg.text.split()[1])
        banned = get_banned()
        banned.append(uid)
        save_banned(banned)
        bot.send_message(msg.chat.id, "🚫 تم الحظر")
    except:
        bot.send_message(msg.chat.id, "اكتب: /ban 123")

@bot.message_handler(commands=['unban'])
def unban(msg):
    if msg.from_user.id != ADMIN_ID:
        return
    try:
        uid = int(msg.text.split()[1])
        banned = get_banned()
        banned.remove(uid)
        save_banned(banned)
        bot.send_message(msg.chat.id, "✅ تم فك الحظر")
    except:
        pass

@bot.message_handler(commands=['broadcast'])
def broadcast(msg):
    if msg.from_user.id != ADMIN_ID:
        return
    text = msg.text.replace("/broadcast ", "")
    for u in get_users():
        try:
            bot.send_message(u, text)
        except:
            pass
    bot.send_message(msg.chat.id, "📢 تم الإرسال")

print("🔥 Bot Running...")
bot.infinity_polling()
