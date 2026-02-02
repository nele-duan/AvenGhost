# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Install simple tools (curl, jq, sudo, docker-cli, tzdata, util-linux) for system management
RUN apk add --no-cache curl jq sudo docker-cli tzdata util-linux

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist
COPY src/skills ./src/skills
# Copy setup script if user wants to run setup inside container (rare but possible)
COPY setup.js ./

# Create data and workspace dirs
RUN mkdir -p data workspace

CMD ["node", "dist/index.js"]
