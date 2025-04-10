import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Активируем загрузку переменных окружения из .env файла
dotenv.config();

// Получаем правильный __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем папку для временного хранения файлов, если ее нет
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Инициализация бота
const bot = new TelegramBot(process.env.TOKEN, {
  polling: true,
  filepath: false,
});

// Настройка хранилища для файлов
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// Настройка Express сервера
const app = express();
app.use(cors());

// Путь к файлу с счетчиком заказов
const counterFilePath = path.join(__dirname, "orderCounter.json");

// Функция для получения следующего номера заказа
function generateOrderId() {
  let counter = 1;

  // Проверяем существование файла с счетчиком
  if (fs.existsSync(counterFilePath)) {
    try {
      const data = fs.readFileSync(counterFilePath, "utf8");
      const counterData = JSON.parse(data);
      counter = counterData.lastOrderNumber + 1;
    } catch (error) {
      console.error("Ошибка при чтении счетчика заказов:", error);
    }
  }

  // Сохраняем новое значение счетчика
  try {
    fs.writeFileSync(
      counterFilePath,
      JSON.stringify({ lastOrderNumber: counter })
    );
  } catch (error) {
    console.error("Ошибка при сохранении счетчика заказов:", error);
  }

  // Форматируем номер заказа с ведущими нулями
  const formattedCounter = counter.toString().padStart(4, "0");
  return `Заказ-${formattedCounter}`;
}

// API эндпоинт для приема данных с формы
app.post("/api/submit-form", upload.array("files"), async (req, res) => {
  try {
    const orderId = generateOrderId();
    console.log("Получены данные формы:", req.body);

    const { name, telephone, mail, message } = req.body;
    const files = req.files || [];

    // Формируем сообщение
    let messageText = `
🆕 Новая заявка #${orderId}

👤 Имя: ${name || "Не указано"}
📞 Телефон: ${telephone || "Не указан"}
✉️ Email: ${mail || "Не указан"}
💬 Сообщение: ${message || "Не указано"}
📎 Файлы: ${files.length > 0 ? `Приложено (${files.length})` : "Нет"}
    `;

    // Отправляем текст сообщения
    await bot.sendMessage(process.env.ADMIN_CHAT_ID, messageText);

    // Отправляем файлы
    for (const file of files) {
      await bot.sendDocument(process.env.ADMIN_CHAT_ID, file.path, {
        caption: `Файл для заявки ${orderId}`,
      });

      // Удаляем файл после отправки
      fs.unlinkSync(file.path);
    }

    await bot.sendMessage(
      process.env.ADMIN_CHAT_ID,
      "_____________________________"
    );

    res.status(200).json({
      success: true,
      orderId: orderId,
      message: "Заявка успешно отправлена",
    });
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({
      success: false,
      message: "Произошла ошибка при обработке заявки",
    });
  }
});

// Запуск сервера
app.listen(process.env.PORT, () => {
  console.log(`Сервер запущен на порту ${process.env.PORT}`);
});
