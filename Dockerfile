FROM node:20.11-alpine

# Создаем рабочую директорию
WORKDIR /app

# Принимаем стартовый номер заказа на этапе сборки (опционально)
ARG ORDER_START
ENV ORDER_START=${ORDER_START}

# Копируем файлы для установки зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY *.js ./
COPY .env ./

# Создаем директорию для временных файлов
RUN mkdir -p uploads

# Открываем порт, указанный в .env
EXPOSE 7067

# Запускаем приложение
CMD ["node", "bot.js"]