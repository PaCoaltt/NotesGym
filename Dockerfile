FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
RUN mkdir -p /runtime/node_modules && cp -RL node_modules/nodemailer /runtime/node_modules/nodemailer

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV NOTESGYM_DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server.js package.json ./
COPY server ./server
COPY --from=build /runtime/node_modules ./node_modules
COPY src/lib/analytics/config.js src/lib/analytics/statistics.js src/lib/analytics/simulationSettings.js src/lib/analytics/accountSimulationSettings.js ./src/lib/analytics/
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server.js"]
