FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/dashboard/package*.json ./packages/dashboard/
RUN npm ci --workspace=packages/dashboard
COPY packages/sdk ./packages/sdk
RUN npm run build -w packages/sdk
COPY packages/dashboard ./packages/dashboard
RUN npm run build -w packages/dashboard

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static
COPY --from=builder /app/packages/dashboard/public ./packages/dashboard/public
EXPOSE 3000
CMD ["node", "packages/dashboard/server.js"]
