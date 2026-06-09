FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl curl

COPY package*.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/backend/prisma/ ./packages/backend/prisma/

RUN npm ci

RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma

COPY packages/backend/src/ ./packages/backend/src/
COPY packages/backend/tsconfig.json ./packages/backend/

RUN npm run build -w packages/backend

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "packages/backend/dist/server.js"]
