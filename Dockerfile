# ---------- Build stage (native modules friendly) ----------
FROM node:20-bullseye AS build
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev || npm install --production

# Ensure native deps are built correctly (for better-sqlite3)
ENV npm_config_build_from_source=true

COPY . .
RUN npm rebuild better-sqlite3 --build-from-source

# ---------- Runtime stage ----------
FROM node:20-bullseye-slim
WORKDIR /app

COPY --from=build /app /app

# Ensure writable DB directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
CMD ["npm", "start"]
