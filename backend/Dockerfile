FROM node:20-alpine

RUN apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s \
 CMD wget --quiet --tries=1 --spider http://localhost:5000/healthz || exit 1

CMD ["npm", "start"]
