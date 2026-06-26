# Production Multi-Stage Dockerfile for Node.js Application
# Minimizes container image footprint and vulnerability vectors

# --- Stage 1: Dependency builder ---
FROM node:22-alpine AS builder

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production

# --- Stage 2: Final secure runner ---
FROM node:22-alpine

# Upgrade OS packages to patch known vulnerabilities and remove developer tools / package managers to reduce attack surface
RUN apk update && apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /opt/yarn-v* \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg

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
