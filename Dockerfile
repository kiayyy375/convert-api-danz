WORKDIR /app

COPY . .

# Paksa install modul tus sebelum menjalankan instalasi utama
RUN npm install @tus/server @tus/file-datastore

RUN npm install

CMD ["node", "server.js"]
