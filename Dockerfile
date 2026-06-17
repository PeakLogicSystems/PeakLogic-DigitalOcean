FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY .env.example ./

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3100/health || exit 1

CMD ["npm", "start"]
