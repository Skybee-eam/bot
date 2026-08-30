# Site B (bot-worker-engine): dedicated 24/7 multi-bot worker.
# Explicit Dockerfile so Railway (or any container host) builds this exact
# directory deterministically, instead of relying on a builder's own project
# auto-detection across a monorepo that has several package.json files.
FROM node:20-bookworm

WORKDIR /app

# Install dependencies first so this layer is cached unless package files change.
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Now bring in the rest of the service.
COPY . .

# cloud-worker.js reads PORT for its own small HTTP health-check server.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "cloud-worker.js"]
