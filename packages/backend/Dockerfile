FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
RUN npm ci --workspace=packages/backend

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules
COPY package*.json ./
COPY packages/backend ./packages/backend
WORKDIR /app/packages/backend
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/server.js"]
