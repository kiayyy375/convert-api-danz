const express = require("express")
const multer = require("multer")
const cors = require("cors")
const fs = require("fs")
const axios = require("axios")
const { exec } = require("child_process")
const path = require("path")
const FormData = require("form-data")
async function sendTelegram(text) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
            {
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text
            },
            {
                timeout: 5000
            }
        )
    } catch (e) {
        console.log("[TELEGRAM ERROR]", e.message)
    }
}
const app = express()

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "authorization"]
}))

app.options("*", cors())
app.use(express.json())

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("public")) fs.mkdirSync("public");

app.use("/video", express.static(path.join(__dirname, "public")))

const upload = multer({ dest: "uploads/" })

global.results = []
global.videoProgress = {} 

app.get("/", (req, res) => {
    res.send("API READY")
})


app.get("/api/progress", (req, res) => {
    const id = req.query.id
    if (!id || !global.videoProgress[id]) {
        return res.json({ status: false, progress: 0, message: "ID tidak ditemukan" })
    }
    res.json(global.videoProgress[id])
})

app.get("/results", (req, res) => {
    const data = [...global.results]
    global.results = []
    res.json(data)
})

//jsjsjzjjdjd
app.post("/api/upload", upload.single("video"), async (req, res) => {
    const file = req.file
    const { nomor } = req.body

    try {
        if (!file) return res.json({ status: false, error: "File video kosong" })

        const tokenHeader = req.headers["authorization"]
        const tokenDiharapkan = `Bearer ${Buffer.from("DANZZ").toString("base64")}`
        if (!tokenHeader || tokenHeader !== tokenDiharapkan) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.json({ status: false, error: "Akses tidak sah!" })
        }

        const videoId = Date.now().toString()
        global.videoProgress[videoId] = { status: "proses", message: "Mengantre video..." }

        res.json({ status: true, id: videoId })

        const durasi = await dapatkanDurasiVideo(file.path)
        const outputFilename = `${Date.now()}_HD_DanzClean.mp4`
        const normalized = path.join(__dirname, "public", outputFilename)

        const fpsVideo = await new Promise((resolve) => {
            exec(
                `ffprobe -v 0 -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${file.path}"`,
                (err, stdout) => {
                    if (err) return resolve(30)
                    const hasilClean = stdout.trim()
                    if (!hasilClean) return resolve(30)
                    
                    const rate = hasilClean.split("/")
                    if (rate.length === 2) {
                        const atas = Number(rate[0])
                        const bawah = Number(rate[1])
                        if (bawah === 0 || isNaN(atas) || isNaN(bawah)) return resolve(30)
                        resolve(Math.round(atas / bawah))
                    } else {
                        const angkaSingel = Number(hasilClean)
                        resolve(isNaN(angkaSingel) ? 30 : Math.round(angkaSingel))
                    }
                }
            )
        })

        const targetFps = (isNaN(fpsVideo) || fpsVideo > 60) ? 60 : fpsVideo

        if (currentProcess >= MAX_PROCESS) {
            await new Promise(resolve => {
                waitingQueue.push(resolve)
            })
        }

        currentProcess++

        const perintahFfmpeg =
`ffmpeg \
-err_detect ignore_err \
-fflags +discardcorrupt \
-analyzeduration 50M \
-probesize 50M \
-i "${file.path}" \
-vf "scale='if(gte(iw,ih),-2,720)':'if(gte(iw,ih),720,-2)',hqdn3d=0.5:0.5:1.0:1.0,unsharp=3:3:0.4:3:3:0.4" \
-r ${targetFps} \
-c:v libx264 \
-preset veryfast \
-rc-lookahead 10 \
-crf 18 \
-aq-mode 3 \
-colorspace bt709 \
-color_trc bt709 \
-color_primaries bt709 \
-maxrate 12M \
-bufsize 12M \
-pix_fmt yuv420p \
-threads 2 \
-c:a aac \
-b:a 128k \
-movflags +faststart \
"${normalized}"`

        exec(perintahFfmpeg, async (err, stdout, stderr) => {
            if (currentProcess > 0) currentProcess--
            if (waitingQueue.length > 0) {
                const next = waitingQueue.shift()
                next()
            }

            if (fs.existsSync(file.path)) fs.unlinkSync(file.path)

            if (err) {
                global.videoProgress[videoId] = { status: "error", message: "Gagal merender video." }
                
                const formatSize = (bytes) => {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                };

                const errorText = err.message + "\n" + (stderr || "");
                
                await sendTelegram(
`❌ DanzClean Error

Nomor:
${nomor}

File:
${file.originalname}

Ukuran:
${formatSize(file.size)}

Durasi:
${durasi ? durasi + "s" : "Gagal Hitung"}

FPS Asli:
${fpsVideo}

Target FPS:
${targetFps}

Bitrate:
${Math.round((file.size * 8) / (durasi || 1) / 1000)}k

Error:
${errorText.slice(-3500)}`
                )
                return
            }

            const domainPenyedia = req.get("host");
            const protocolPenyedia = req.protocol;
            const resultUrl = `${protocolPenyedia}://${domainPenyedia}/video/${outputFilename}`;

            global.videoProgress[videoId] = { status: "selesai", message: "Video HD Matang!", url: resultUrl }
            global.results.push({ url: resultUrl, nomor: nomor, time: Date.now() });

            setTimeout(() => {
                if (fs.existsSync(normalized)) fs.unlink(normalized, () => {});
            }, 5 * 60 * 1000); 
        })

    } catch (error) {
        if (currentProcess > 0) currentProcess--
        if (waitingQueue.length > 0) {
            const next = waitingQueue.shift()
            next()
        }
        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path)
        if (!res.headersSent) res.json({ status: false, error: "Gagal memproses HD video: " + error.message })
    }
})

app.post("/api/upload-chunk", upload.single("videoChunk"), async (req, res) => {
    const fileChunk = req.file;
    const { chunkIndex, totalChunks, chunkToken, filename, nomor } = req.body;

    try {
        if (!fileChunk) return res.json({ status: false, error: "Potongan file kosong" });

        const chunkDir = path.join(__dirname, "uploads", chunkToken);
        if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir);

        const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
        fs.renameSync(fileChunk.path, chunkPath);

        if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
            const finalPath = path.join(__dirname, "uploads", `${Date.now()}_${filename}`);
            const writeStream = fs.createWriteStream(finalPath);

            for (let i = 0; i < totalChunks; i++) {
                const targetChunkPath = path.join(chunkDir, `chunk_${i}`);
                const buffer = fs.readFileSync(targetChunkPath);
                writeStream.write(buffer);
                fs.unlinkSync(targetChunkPath); 
            }
            writeStream.end();
            fs.rmdirSync(chunkDir); 

            // 1. LANGSUNG kirim status sukses ke frontend biar 49%-nya langsung lolos & tidak timeout!
            res.json({ status: true, message: "File berhasil disatukan, memproses HD..." });

            // 2. Jalankan pengiriman data ke rute upload utama di background server tanpa membuat user menunggu
            setImmediate(async () => {
                try {
                    const form = new FormData();
                    form.append("video", fs.createReadStream(finalPath), {
                        filename: filename,
                        contentType: "video/mp4"
                    });
                    form.append("nomor", nomor);

                    const tokenTokenan = `Bearer ${Buffer.from("DANZZ").toString("base64")}`;
                    const targetPort = process.env.PORT || 3000;

                    // Mengirim ke endpoint lokal /upload (pastikan rute utama kamu tipenya app.post("/upload") atau app.post("/api/upload"))
                    await axios.post(`http://127.0.0.1:${targetPort}/upload`, form, {
                        headers: { ...form.getHeaders(), "authorization": tokenTokenan },
                        maxContentLength: Infinity, 
                        maxBodyLength: Infinity
                    });

                    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                } catch (err) {
                    console.log("[DanzClean Background Post Error]:", err.message);
                    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                }
            });
            return;
        }

        return res.json({ status: true, message: `Chunk ${chunkIndex} sukses disimpan.` });

    } catch (error) {
        console.log("[DanzClean Chunk Error]: ", error.message);
        return res.json({ status: false, error: "Gagal menyatukan potongan file: " + error.message });
    }
});



app.use((err, req, res, next) => {
    res.status(500).json({ status: false, error: "Internal Server Error" })
})

app.listen(process.env.PORT || 3000, () => {
    console.log("API READY")
})
