FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/prisma ./packages/backend/prisma/

RUN npm ci --workspace=packages/backend

COPY packages/backend/src ./packages/backend/src

RUN npm run build -w packages/backend

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S wrankey && adduser -S wrankey -G wrankey

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json

USER wrankey

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma && node packages/backend/dist/server.js"]
