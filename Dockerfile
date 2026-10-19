FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV NOTESGYM_DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server.js package.json ./
COPY server/security.js ./server/security.js
COPY src/lib/analytics/config.js src/lib/analytics/statistics.js src/lib/analytics/simulationSettings.js src/lib/analytics/accountSimulationSettings.js ./src/lib/analytics/
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server.js"]
