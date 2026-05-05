FROM node:20-alpine

WORKDIR /app

# Install only production deps first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app.
COPY . .

# Render / Fly / Railway all set $PORT; the app already honors it.
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "backend/server.js"]
