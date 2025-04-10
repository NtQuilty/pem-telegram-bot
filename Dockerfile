FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем файлы для установки зависимостей
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY *.ts ./
COPY .env ./

# Создаем директорию для временных файлов
RUN mkdir -p uploads

# Собираем TypeScript проект
RUN npm run build

# Открываем порт, указанный в .env
EXPOSE 7067

# Запускаем приложение
CMD ["npx", "ts-node", "bot.ts"]