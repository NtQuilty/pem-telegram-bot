import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  BOT_TOKEN: process.env.TOKEN,
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
  PORT: process.env.PORT || 3000,
  ORDER_START: process.env.ORDER_START,
  UPLOADS_DIR: path.join(__dirname, "uploads"),
  COUNTER_FILE: path.join(__dirname, "orderCounter.json"),
  ORDER_ID_PADDING: 4
};


class OrderCounter {
  constructor(counterFilePath, orderStart) {
    this.counterFilePath = counterFilePath;
    this.initializeCounter(orderStart);
  }

  initializeCounter(orderStart) {
    try {
      if (!orderStart) return;

      const envStart = parseInt(orderStart, 10);
      if (Number.isNaN(envStart) || envStart <= 0) return;

      const desiredLast = envStart - 1;
      const currentLast = this.readCurrentCounter();

      if (currentLast === null || currentLast < desiredLast) {
        this.writeCounter(desiredLast);
        console.log(`Счетчик заказов инициализирован значением: ${desiredLast}`);
      }
    } catch (error) {
      console.error("Ошибка при инициализации счетчика из ORDER_START:", error);
    }
  }

  readCurrentCounter() {
    if (!fs.existsSync(this.counterFilePath)) return null;

    try {
      const data = fs.readFileSync(this.counterFilePath, "utf8");
      const parsed = JSON.parse(data);
      return parsed.lastOrderNumber;
    } catch (error) {
      console.error("Ошибка при чтении счетчика заказов:", error);
      return null;
    }
  }


  writeCounter(value) {
    try {
      fs.writeFileSync(
        this.counterFilePath,
        JSON.stringify({ lastOrderNumber: value })
      );
    } catch (error) {
      console.error("Ошибка при сохранении счетчика заказов:", error);
      throw error;
    }
  }

  generateOrderId() {
    const currentCounter = this.readCurrentCounter() || 0;
    const nextCounter = currentCounter + 1;
    
    this.writeCounter(nextCounter);
    
    const formattedCounter = nextCounter.toString().padStart(CONFIG.ORDER_ID_PADDING, "0");
    return `Заказ-${formattedCounter}`;
  }
}

class TelegramUtils {
  static formatOrderMessage(orderId, formData, files) {
    const { name, telephone, mail, message } = formData;
    
    return `
🆕 Новая заявка #${orderId}

👤 Имя: ${name || "Не указано"}
📞 Телефон: ${telephone || "Не указан"}
✉️ Email: ${mail || "Не указан"}
💬 Сообщение: ${message || "Не указано"}
📎 Файлы: ${files.length > 0 ? `Приложено (${files.length})` : "Нет"}
    `.trim();
  }

  static async sendOrderToTelegram(bot, chatId, orderId, formData, files) {
    const messageText = this.formatOrderMessage(orderId, formData, files);
    
    await bot.sendMessage(chatId, messageText);

    for (const file of files) {
      try {
        const fileStream = fs.createReadStream(file.path);
        await bot.sendDocument(chatId, fileStream, {
          caption: `Файл для заявки ${orderId}`,
        });
        
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error(`Ошибка при отправке файла ${file.originalname}:`, error);
        try {
          fs.unlinkSync(file.path);
        } catch (_) {}
      }
    }

    await bot.sendMessage(chatId, "_____________________________");
  }
}

function ensureUploadsDirectory() {
  if (!fs.existsSync(CONFIG.UPLOADS_DIR)) {
    fs.mkdirSync(CONFIG.UPLOADS_DIR, { recursive: true });
  }
}

function validateConfig() {
  const requiredEnvVars = ['TOKEN', 'ADMIN_CHAT_ID', 'PORT'];
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Отсутствуют обязательные переменные окружения: ${missing.join(', ')}`);
  }
}

validateConfig();
ensureUploadsDirectory();

const orderCounter = new OrderCounter(CONFIG.COUNTER_FILE, CONFIG.ORDER_START);

const bot = new TelegramBot(CONFIG.BOT_TOKEN, {
  polling: true,
  filepath: false,
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, chatId.toString());
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CONFIG.UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());

function validateFormData(formData) {
  const errors = [];
  
  if (formData.mail && !/\S+@\S+\.\S+/.test(formData.mail)) {
    errors.push("Некорректный формат email");
  }
  
  if (formData.telephone && !/^[\d\s\-\+\(\)]+$/.test(formData.telephone)) {
    errors.push("Некорректный формат телефона");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
app.post("/api/submit-form", upload.array("files"), async (req, res) => {
  try {
    console.log("Получены данные формы:", req.body);
    
    const formData = {
      name: req.body.name?.trim(),
      telephone: req.body.telephone?.trim(),
      mail: req.body.mail?.trim(),
      message: req.body.message?.trim()
    };
    
    const files = req.files || [];
    
    const validation = validateFormData(formData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Ошибка валидации данных",
        errors: validation.errors
      });
    }
    
    const orderId = orderCounter.generateOrderId();
    console.log(`Создан заказ: ${orderId}`);
    
    await TelegramUtils.sendOrderToTelegram(
      bot,
      CONFIG.ADMIN_CHAT_ID,
      orderId,
      formData,
      files
    );
    
    console.log(`Заказ ${orderId} успешно отправлен в Telegram`);
    
    res.status(200).json({
      success: true,
      orderId: orderId,
      message: "Заявка успешно отправлена",
    });
    
  } catch (error) {
    console.error("Ошибка при обработке заявки:", error);
    
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (_) {}
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Произошла ошибка при обработке заявки",
    });
  }
});

app.use((error, req, res, next) => {
  console.error("Необработанная ошибка Express:", error);
  res.status(500).json({
    success: false,
    message: "Внутренняя ошибка сервера"
  });
});

app.listen(CONFIG.PORT, () => {
  console.log(`Сервер запущен на порту ${CONFIG.PORT}`);
  console.log(`Telegram бот инициализирован`);
  console.log(`Папка для загрузок: ${CONFIG.UPLOADS_DIR}`);
});
