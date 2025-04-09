FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем скомпилированные файлы
COPY dist/ ./dist/

# Копируем .env
COPY .env ./

# Создаем директорию для временных файлов
RUN mkdir -p uploads

# Открываем порт
EXPOSE 7067

# Запускаем приложение
CMD ["node", "dist/bot.js"]