require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const YTDlpWrap = require("yt-dlp-wrap").default;
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// ─── Init Bot ───────────────────────────────────────────────
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ytDlp = new YTDlpWrap();
const downloadDir = path.join(__dirname, "downloads");

// Buat folder downloads jika belum ada
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

// ─── Helper: Validasi URL Facebook ──────────────────────────
function isFacebookUrl(url) {
  return /https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.com)\/.+/.test(url);
}

// ─── Helper: Hapus file setelah dikirim ─────────────────────
function deleteFile(filePath) {
  setTimeout(() => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }, 10000); // hapus setelah 10 detik
}

// ─── Command /start ─────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "Kawan";
  bot.sendMessage(
    msg.chat.id,
    `👋 Halo *${name}*! Selamat datang di *FB Video Downloader Bot* 🎬\n\n` +
    `📌 *Cara pakai:*\n` +
    `Kirimkan link video Facebook ke bot ini, dan video akan langsung dikirim ke kamu!\n\n` +
    `📎 *Contoh URL yang didukung:*\n` +
    `• https://www.facebook.com/watch?v=xxx\n` +
    `• https://fb.watch/xxxxx\n` +
    `• https://www.facebook.com/reel/xxx\n\n` +
    `⚡ Powered by yt-dlp`,
    { parse_mode: "Markdown" }
  );
});

// ─── Command /help ───────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🆘 *Bantuan FB Downloader Bot*\n\n` +
    `📌 Cukup kirim link video Facebook, bot akan otomatis mengunduh dan mengirimkan videonya.\n\n` +
    `✅ *Format URL yang didukung:*\n` +
    `• facebook.com/watch?v=...\n` +
    `• fb.watch/...\n` +
    `• facebook.com/reel/...\n` +
    `• facebook.com/videos/...\n\n` +
    `⚠️ *Catatan:* Video dengan ukuran lebih dari 50MB tidak dapat dikirim via Telegram.\n\n` +
    `📬 Kontak: @adminmu`,
    { parse_mode: "Markdown" }
  );
});

// ─── Proses URL yang dikirim user ────────────────────────────
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Abaikan jika bukan URL atau command
  if (!text || text.startsWith("/")) return;

  // Validasi URL Facebook
  if (!isFacebookUrl(text)) {
    return bot.sendMessage(chatId,
      `❌ *URL tidak valid!*\n\nHarap kirimkan link video dari Facebook.\n\nContoh:\n• https://www.facebook.com/watch?v=xxx\n• https://fb.watch/xxxxx`,
      { parse_mode: "Markdown" }
    );
  }

  // Kirim pesan loading
  const loadingMsg = await bot.sendMessage(chatId,
    `⏳ *Sedang mengunduh video...*\n\nMohon tunggu sebentar ya 😊`,
    { parse_mode: "Markdown" }
  );

  const fileName = `fb_${uuidv4()}.mp4`;
  const outputPath = path.join(downloadDir, fileName);

  try {
    // ─── Download video menggunakan yt-dlp ─────────────────
    await ytDlp.execPromise([
      text,
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format", "mp4",
      "-o", outputPath,
      "--no-playlist",
      "--max-filesize", "50m",
    ]);

    // Cek apakah file berhasil dibuat
    if (!fs.existsSync(outputPath)) {
      throw new Error("File tidak ditemukan setelah download.");
    }

    const fileSize = fs.statSync(outputPath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    // Hapus pesan loading
    await bot.deleteMessage(chatId, loadingMsg.message_id);

    // Kirim video ke user
    await bot.sendVideo(chatId, outputPath, {
      caption:
        `✅ *Video berhasil diunduh!*\n\n` +
        `📦 Ukuran: *${fileSizeMB} MB*\n` +
        `🔗 Sumber: Facebook\n\n` +
        `🤖 _FB Downloader Bot_`,
      parse_mode: "Markdown",
      supports_streaming: true,
    });

    // Hapus file lokal setelah dikirim
    deleteFile(outputPath);

  } catch (err) {
    // Hapus file jika ada
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    // Hapus pesan loading
    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (_) {}

    console.error("Error:", err.message);

    // Tampilkan pesan error ke user
    let errorMsg = `❌ *Gagal mengunduh video!*\n\n`;

    if (err.message.includes("File is too large")) {
      errorMsg += `⚠️ Video terlalu besar (>50MB).\nCoba link video yang lebih pendek.`;
    } else if (err.message.includes("Private")) {
      errorMsg += `🔒 Video bersifat *private* atau hanya untuk teman.\nCoba video yang bisa diakses publik.`;
    } else {
      errorMsg += `⚠️ Kemungkinan penyebab:\n• Video private/teman saja\n• URL tidak valid\n• Video telah dihapus\n\nCoba link lain atau hubungi admin.`;
    }

    bot.sendMessage(chatId, errorMsg, { parse_mode: "Markdown" });
  }
});

// ─── Log Bot Aktif ───────────────────────────────────────────
console.log("🤖 FB Downloader Bot berjalan...");
