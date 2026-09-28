FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PEAKLOGIC_DATA=/data
ENV PORT=3090
ENV PEAKLOGIC_DEPLOYMENT=cloud
ENV PEAKLOGIC_MAX_TAGS=70912

EXPOSE 3090

CMD ["node", "server.js"]
