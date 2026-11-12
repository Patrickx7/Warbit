# Servidor do WarBit (+ cliente já compilado, servido pelo próprio servidor).
# Precisa de Node 22.5+ por causa do SQLite embutido (node:sqlite).
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

COPY packages packages
# compila o cliente: o servidor entrega o jogo em / e o WebSocket em /ws (um endereço só)
RUN npm run build -w @warbit/client

ENV PORT=8080
ENV DB_PATH=/data/warbit.sqlite
VOLUME ["/data"]
EXPOSE 8080

CMD ["npx", "tsx", "packages/server/src/index.ts"]
