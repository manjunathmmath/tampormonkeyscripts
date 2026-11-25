# Groot: the backend and the built frontend in one image.
#   docker build -t groot .
#   docker run -d --name groot -p 4000:4000 --env-file backend/.env -v groot-data:/app/data groot
# The data volume holds the Kite token, saved layouts, candle cache and holiday list, so a restart keeps them.
FROM node:20-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATA_DIR=/app/data FRONTEND_DIR=/app/frontend TZ=Asia/Kolkata
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend /build/backend/dist ./dist
COPY --from=frontend /build/frontend/dist ./frontend
VOLUME /app/data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/health/ping || exit 1
CMD ["node", "dist/main.js"]
