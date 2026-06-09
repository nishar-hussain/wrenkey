FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN npm ci

COPY packages/sdk/tsconfig.json ./packages/sdk/
COPY packages/sdk/tsup.config.ts ./packages/sdk/
COPY packages/sdk/src/ ./packages/sdk/src/
RUN npm run build -w packages/sdk

COPY packages/dashboard/tsconfig.json ./packages/dashboard/
COPY packages/dashboard/vite.config.ts ./packages/dashboard/
COPY packages/dashboard/tailwind.config.js ./packages/dashboard/
COPY packages/dashboard/postcss.config.js ./packages/dashboard/
COPY packages/dashboard/index.html ./packages/dashboard/
COPY packages/dashboard/src/ ./packages/dashboard/src/
RUN npm run build -w packages/dashboard

FROM nginx:alpine

COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
