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

FROM nginx:alpine AS runner
COPY --from=builder /app/packages/dashboard/.next/standalone /app
COPY --from=builder /app/packages/dashboard/.next/static /app/.next/static
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
