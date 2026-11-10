# GABER: один контейнер отдаёт собранный сайт и API. PRODUCTION HOLD: образ для стенда и демонстрации,
# не для реальных заказов. Миграции применяются отдельно (docs/DEPLOY.md), образ их не запускает.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc* ./
RUN npm ci --ignore-scripts && npm rebuild argon2
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production GABER_STATIC_DIR=/app/dist HOST=0.0.0.0 PORT=8788
WORKDIR /app
COPY package.json package-lock.json .npmrc* ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild argon2 && npm cache clean --force
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
