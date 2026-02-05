# Build Stage
# Build Stage
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:20-slim

WORKDIR /app

# Install simple tools (curl, jq, sudo, docker-cli, tzdata, util-linux, git, openssh-client, bash) for system management
# Install simple tools (curl, jq, sudo, docker-cli, tzdata, util-linux, git, openssh-client, bash) for system management
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl jq sudo docker.io tzdata util-linux git openssh-client bash unzip \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist
COPY src/skills ./src/skills
# Copy setup script if user wants to run setup inside container (rare but possible)
COPY setup.js ./

# Create data and workspace dirs
RUN mkdir -p data workspace

CMD ["node", "dist/index.js"]
