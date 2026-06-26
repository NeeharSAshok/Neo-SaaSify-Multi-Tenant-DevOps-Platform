# Production Multi-Stage Dockerfile for Node.js Application
# Minimizes container image footprint and vulnerability vectors

# --- Stage 1: Dependency builder ---
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production

# --- Stage 2: Final secure runner ---
FROM node:18-alpine
WORKDIR /usr/src/app

# Set Node environment to production
ENV NODE_ENV=production

# Copy built node_modules and app assets
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY public/ ./public/

# Run the app under non-root node user for security hardening
USER node

EXPOSE 3000
CMD ["node", "server.js"]
