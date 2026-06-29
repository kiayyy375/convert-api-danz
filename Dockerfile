FROM node:22

RUN apt update && apt install -y ffmpeg

WORKDIR /app

COPY . .

RUN npm install @tus/server @tus/file-datastore

RUN npm install

CMD ["node", "server.js"]
