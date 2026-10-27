FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
# A new named volume copies this dir's owner; root-owned, the jwt.secret write would crash-loop the app.
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/backend/data && chown node:node /app/backend/data
COPY --from=build /app /app
USER node
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
