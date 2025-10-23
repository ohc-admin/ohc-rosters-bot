# Use the official Node LTS image
FROM node:18-alpine

# Create and set working directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source files
COPY . .

# Start the bot
CMD ["npm", "start"]
