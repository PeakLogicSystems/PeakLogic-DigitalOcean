FROM node:20-alpine



WORKDIR /app



COPY package.json package-lock.json ./

RUN npm ci --omit=dev



COPY src ./src

COPY views ./views

COPY public ./public

COPY st ./st

COPY scripts ./scripts

COPY .env.example ./



ENV NODE_ENV=production

ENV PORT=3100

ENV PEAKLOGIC_DEPLOYMENT=cloud

ENV PEAKLOGIC_DATA=/data



RUN mkdir -p /data && chown -R node:node /app /data

USER node



EXPOSE 3100



HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \

  CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"



CMD ["npm", "start"]

