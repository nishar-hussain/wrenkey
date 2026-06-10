FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package*.json ./
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN npm ci

COPY packages/sdk/tsconfig.json ./packages/sdk/
COPY packages/sdk/tsup.config.ts ./packages/sdk/
COPY packages/sdk/src/ ./packages/sdk/src/
RUN npm run build -w packages/sdk

COPY packages/dashboard/next.config.ts ./packages/dashboard/
COPY packages/dashboard/tsconfig.json ./packages/dashboard/
COPY packages/dashboard/tailwind.config.ts ./packages/dashboard/
COPY packages/dashboard/postcss.config.mjs ./packages/dashboard/
COPY packages/dashboard/src/ ./packages/dashboard/src/

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/dashboard

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/packages/dashboard/next.config.ts ./
COPY --from=builder /app/packages/dashboard/public ./public
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static

EXPOSE 80

CMD ["node", "packages/dashboard/server.js"]
