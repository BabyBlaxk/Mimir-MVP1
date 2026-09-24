FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "src/server.js"]
