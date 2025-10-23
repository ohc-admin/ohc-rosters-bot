# Runtime-only image (no native toolchain needed)
FROM node:20-bullseye-slim

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./

# Install prod deps
RUN npm ci --omit=dev || npm install --production

# Copy the app
COPY . .

ENV NODE_ENV=production
# If your entry is src/index.js (GitHub repo layout I gave you)
CMD ["npm", "start"]
# Or, if you’re using a single-file index.js at repo root:
# CMD ["node", "index.js"]
