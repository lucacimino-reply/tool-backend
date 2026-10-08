FROM node:22.21.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY node_modules ./node_modules
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts --offline && npm cache clean --force

FROM node:22.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "--env-file-if-exists=.env", "dist/server.js"]
