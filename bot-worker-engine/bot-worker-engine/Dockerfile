# Duplicate of ../Dockerfile, placed at this nested path because Railway's
# "Dockerfile Path" setting for this service is currently resolving to
# bot-worker-engine/bot-worker-engine/Dockerfile (it appears to prefix the
# Root Directory onto whatever full path was typed into that field). Once the
# Dockerfile Path field on Railway is corrected to just "Dockerfile", this
# nested copy can be deleted — the real one lives at ../Dockerfile.
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
