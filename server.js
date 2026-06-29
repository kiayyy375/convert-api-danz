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
    allowedHeaders: ["Content-Type", "authorization", "upload-metadata", "upload-length", "upload-offset", "tus-resumable"]
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

//=======
const dapatkanDurasiVideo = (filePath) => {


    return new Promise((resolve, reject) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nocreval=1 "${filePath}"`, (err, stdout) => {
            if (err) return resolve(30);
            const durasi = parseFloat(stdout.trim());
            resolve(isNaN(durasi) ? 30 : durasi);
        });
    });
};

let currentProcess = 0
const MAX_PROCESS = 2
const waitingQueue = []

const { Server } = require("@tus/server");
const { FileDatastore } = require("@tus/file-datastore");

// Inisialisasi Tus Server pendeteksi fragmen file
const tusServer = new Server({
    path: "/files",
    datastore: new FileDatastore({
        directory: "./uploads",
    }),
    onUploadFinish: async (req, res, upload) => {
        const videoId = upload.id;
        const filePath = path.join(__dirname, "uploads", videoId);
        
        const metadata = upload.metadata || {};
        const nomor = metadata.nomor;
        const originalname = metadata.filename || "video.mp4";

        global.videoProgress[videoId] = { status: "proses", message: "Memverifikasi nomor grup WhatsApp..." };

        try {
            // 1. CEK MEMBER GITHUB
            const github = await axios.get(
                "https://api.github.com/repos/xyron11/cekverif/contents/verify.json",
                {
                    headers: {
                        Authorization: "token " + process.env.GITHUB_TOKEN,
                        "Cache-Control": "no-cache"
                    }
                }
            );

            const content = Buffer.from(github.data.content, "base64").toString("utf8");
            const members = JSON.parse(content);

            let isMember = members.includes(nomor);

            if (!isMember) {
                try {
                    const realtime = await axios.get(
                        "https://raw.githubusercontent.com/xyron11/cekverif/main/verify.json?nocache=" + Date.now(),
                        { headers: { "Cache-Control": "no-cache" }, timeout: 5000 }
                    );
                    const realtimeMembers = realtime.data || [];
                    isMember = realtimeMembers.includes(nomor);
                } catch { isMember = false; }
            }

            if (!isMember) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                global.videoProgress[videoId] = {
                    status: "error",
                    message: "Nomor tidak ada di grup mohon nomor yang anda pakai harus masuk group dulu, bisa anda pencet tombol join group untuk masuk ke group",
                    join: "https://chat.whatsapp.com/BVtogIjS1hAD0qOMhJ3f6a"
                };
                return;
            }

            // 2. CEK FORMAT EXTENSION
            const ext = originalname.split(".").pop().toLowerCase();
            const allow = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];
            if (!allow.includes(ext)) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                global.videoProgress[videoId] = { status: "error", message: "Hanya file video" };
                return;
            }

            // 3. HITUNG DURASI & BITRATE IDEAL
            global.videoProgress[videoId] = { status: "proses", message: "Menghitung kapasitas video..." };
            const durasiVideo = await dapatkanDurasiVideo(filePath);
            let bitrateIdeal = Math.floor(113246208 / durasiVideo); 
            if (bitrateIdeal > 4000000) bitrateIdeal = 4000000; 
            if (bitrateIdeal < 1200000) bitrateIdeal = 1200000; 
            const targetBitrateKbps = `${Math.floor(bitrateIdeal / 1000)}k`;

            // 4. CEK FPS ASLI
            const fpsVideo = await new Promise((resolve) => {
                exec(`ffprobe -v 0 -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${filePath}"`, (err, stdout) => {
                    if (err) return resolve(30);
                    const rate = stdout.trim().split("/");
                    if (rate.length === 2) {
                        resolve(Math.round(Number(rate[0]) / Number(rate[1])));
                    } else { resolve(30); }
                });
            });
            const targetFps = fpsVideo > 60 ? fpsVideo : 60;

            // 5. SISTEM ANTREAN MAX PROCESS
            if (currentProcess >= MAX_PROCESS) {
                global.videoProgress[videoId] = { status: "proses", message: "Server sibuk, video kamu masuk daftar antrean..." };
                await new Promise(resolve => { waitingQueue.push(resolve); });
            }
            currentProcess++;

            // 6. MULAI RENDER FFMPEG
            global.videoProgress[videoId] = { status: "proses", message: "Sedang mengompres video jadi HD..." };
            const outputFilename = `${Date.now()}_HD_DanzClean.mp4`;
            const normalized = path.join(__dirname, "public", outputFilename);

            const perintahFfmpeg = `ffmpeg -err_detect ignore_err -fflags +discardcorrupt -analyzeduration 100M -probesize 100M -i "${filePath}" -vf "scale='if(gte(iw,ih),-2,720)':'if(gte(iw,ih),720,-2)',hqdn3d=1.0:1.0:2.0:2.0,unsharp=3:3:0.4:3:3:0.4" -r ${targetFps} -c:v libx264 -preset faster -crf 17 -aq-mode 3 -colorspace bt709 -color_trc bt709 -color_primaries bt709 -maxrate 12M -bufsize 12M -pix_fmt yuv420p -threads 2 -c:a aac -b:a 128k -movflags +faststart "${normalized}"`;

            exec(perintahFfmpeg, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
                currentProcess--;
                if (waitingQueue.length > 0) {
                    const next = waitingQueue.shift();
                    next();
                }

                const fileOriginalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Hapus source asli mentah

                const sukses = fs.existsSync(normalized) && fs.statSync(normalized).size > 500 * 1024;

                if (err && !sukses) {
                    const errorText = String(stderr || err.message || err);
                    global.videoProgress[videoId] = { status: "error", message: "Video tidak dapat diproses oleh server." };
                    
                    sendTelegram(`❌ DanzClean Error\n\nNomor:\n${nomor}\n\nFile:\n${originalname}\n\nUkuran:\n${(fileOriginalSize / 1024 / 1024).toFixed(2)} MB\n\nDurasi:\n${durasiVideo}s\n\nFPS Asli:\n${fpsVideo}\n\nTarget FPS:\n${targetFps}\n\nBitrate:\n${targetBitrateKbps}\n\nError:\n${errorText.slice(-3500)}`);
                    return;
                }

                const domainPenyedia = req.get("host");
                const protocolPenyedia = req.protocol;
                const resultUrl = `${protocolPenyedia}://${domainPenyedia}/video/${outputFilename}`;

                global.videoProgress[videoId] = { status: "selesai", message: "Video HD Matang!", url: resultUrl };
                global.results.push({ url: resultUrl, nomor: nomor, time: Date.now() });

                setTimeout(() => {
                    if (fs.existsSync(normalized)) { fs.unlink(normalized, () => {}); }
                }, 5 * 60 * 1000);
            });

        } catch (e) {
            if (currentProcess > 0) currentProcess--;
            if (waitingQueue.length > 0) { const next = waitingQueue.shift(); next(); }
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            global.videoProgress[videoId] = { status: "error", message: "Gagal memproses HD video: " + e.message };
        }
    }
});

// Daftarkan endpoint Tus Server ke route Express
app.all("/files/*", (req, res) => { tusServer.handle(req, res); });
app.all("/files", (req, res) => { tusServer.handle(req, res); });

app.use((err, req, res, next) => {
    res.status(500).json({ status: false, error: "Internal Server Error" })
})

app.listen(process.env.PORT || 3000, () => {
    console.log("API READY")
})
