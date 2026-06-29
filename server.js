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
    methods: [["GET", "POST", "OPTIONS"]],
    allowedHeaders: [["Content-Type", "authorization"]]
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
        return res.json({ status: false, error: "ID Kemajuan tidak valid atau kedaluwarsa" })
    }
    res.json({ status: true, ...global.videoProgress[id] })
})

app.get("/api/results", (req, res) => {
    res.json({ status: true, data: global.results })
})

const waitingQueue = [];
let currentProcess = 0;
const MAX_PROCESS = 1; 

function dapatkanDurasiVideo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (err, stdout) => {
            if (err) return resolve(0);
            resolve(parseFloat(stdout.trim()) || 0);
        });
    });
}

app.post("/upload", upload.single("video"), async (req, res) => {
    const fileVideo = req.file;
    const nomorWa = req.body.nomor;
    const isFromChunk = req.body.isFromChunk || false; 

    const kirimRespon = (dataJson) => {
        if (isFromChunk) {
            if (dataJson.status === false) {
                const idProgress = req.body.videoIdFlag;
                if(idProgress) global.videoProgress[idProgress] = { status: "error", message: dataJson.error };
            }
        } else {
            res.json(dataJson);
        }
    };

    try {
        console.log(`[LOG] Memulai verifikasi rute utama untuk nomor: ${nomorWa}`);
        
        if (!process.env.GITHUB_TOKEN) {
            console.log("[LOG ERROR] GITHUB_TOKEN tidak ditemukan di environment");
            return kirimRespon({ status: false, error: "GITHUB_TOKEN is required" });
        }
        if (!fileVideo) {
            console.log("[LOG ERROR] File video kosong");
            return kirimRespon({ status: false, error: "File video kosong masee" });
        }
        if (!nomorWa) {
            console.log("[LOG ERROR] Nomor WA kosong");
            if (fs.existsSync(fileVideo.path)) fs.unlinkSync(fileVideo.path);
            return kirimRespon({ status: false, error: "Nomor WhatsApp kosong masee" });
        }

        const tokenAuth = req.headers.authorization;
        const tokenValid = `Bearer ${Buffer.from("DANZZ").toString("base64")}`;

        if (!isFromChunk && (!tokenAuth || tokenAuth !== tokenValid)) {
            console.log("[LOG ERROR] Token authorization salah atau akses ilegal");
            if (fs.existsSync(fileVideo.path)) fs.unlinkSync(fileVideo.path);
            return kirimRespon({ status: false, error: "Akses ilegal bro." });
        }

        console.log("[LOG] Menghubungi API GitHub untuk cek grup...");
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

        if (!members.includes(nomorWa)) {
            console.log(`[LOG] Nomor ${nomorWa} tidak ada di primary grup GitHub, mencoba cek realtime raw...`);
            try {
                const realtime = await axios.get(
                    "https://raw.githubusercontent.com/xyron11/cekverif/main/verify.json?nocache=" + Date.now(),
                    { headers: { "Cache-Control": "no-cache" }, timeout: 5000 }
                );
                const realtimeMembers = realtime.data || [];
                if (!realtimeMembers.includes(nomorWa)) {
                    console.log(`[LOG KEPUTUSAN] Nomor ${nomorWa} RESMI TIDAK TERDAFTAR DI GRUP.`);
                    if (fs.existsSync(fileVideo.path)) fs.unlinkSync(fileVideo.path);
                    return kirimRespon({
                        status: false,
                        error: "Nomor tidak ada di grup mohon nomor yang anda pakai harus masuk group dulu, bisa anda pencet tombol join group untuk masuk ke group",
                        join: "https://chat.whatsapp.com/BVtogIjS1hAD0qOMhJ3f6a"
                    });
                }
            } catch (errDb) {
                console.log("[LOG ERROR] Gagal mengambil backup realtime raw GitHub:", errDb.message);
                if (fs.existsSync(fileVideo.path)) fs.unlinkSync(fileVideo.path);
                return kirimRespon({
                    status: false,
                    error: "Nomor tidak ada di grup mohon nomor yang anda pakai harus masuk group dulu, bisa anda pencet tombol join group untuk masuk ke group",
                    join: "https://chat.whatsapp.com/BVtogIjS1hAD0qOMhJ3f6a"
                });
            }
        }

        console.log(`[LOG SUKSES] Nomor ${nomorWa} lolos verifikasi grup!`);

        const outputFilename = `${Date.now()}_HD_DanzClean.mp4`;
        const normalized = path.join(__dirname, "public", outputFilename);
        
        const durasiVideo = await dapatkanDurasiVideo(fileVideo.path);
        
        const fpsVideo = await new Promise((resolve) => {
            exec(`ffprobe -v 0 -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${fileVideo.path}"`, (err, stdout) => {
                if (err) return resolve(30);
                const rate = stdout.trim().split("/");
                if (rate.length === 2) {
                    resolve(Math.round(Number(rate[0]) / Number(rate[1])));
                } else {
                    resolve(30);
                }
            });
        });

        const targetFps = fpsVideo > 60 ? fpsVideo : 60;

        if (currentProcess >= MAX_PROCESS) {
            console.log(`[LOG ANTRIAN] Server penuh. Memasukkan video ke dalam antrean...`);
            await new Promise(resolve => { waitingQueue.push(resolve); });
        }
        currentProcess++;

        const perintahFfmpeg = `ffmpeg -err_detect ignore_err -fflags +discardcorrupt -analyzeduration 50M -probesize 50M -i "${fileVideo.path}" -vf "scale='if(gte(iw,ih),-2,720)':'if(gte(iw,ih),720,-2)',hqdn3d=0.5:0.5:1.0:1.0,unsharp=3:3:0.4:3:3:0.4" -r ${targetFps} -c:v libx264 -preset veryfast -rc-lookahead 10 -crf 18 -aq-mode 3 -colorspace bt709 -color_trc bt709 -color_primaries bt709 -maxrate 12M -bufsize 12M -pix_fmt yuv420p -threads 2 -c:a aac -b:a 128k -movflags +faststart "${normalized}"`;

        const videoId = req.body.videoIdFlag || `vid_${Date.now()}`;
        global.videoProgress[videoId] = { status: "proses", message: "Sedang mengompres video jadi HD..." };

        console.log(`[LOG FFMPEG] Memulai eksekusi render video ke HD (${targetFps} FPS)...`);

        if (!isFromChunk) {
            res.json({
                status: true,
                id: videoId,
                message: "Video aman! Memulai render HD..."
            });
        }

        exec(perintahFfmpeg, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
            currentProcess--;
            if (waitingQueue.length > 0) {
                console.log("[LOG ANTRIAN] Mengeluarkan slot antrean berikutnya...");
                const next = waitingQueue.shift();
                next();
            }

            if (fs.existsSync(fileVideo.path)) fs.unlinkSync(fileVideo.path);

            const sukses = fs.existsSync(normalized) && fs.statSync(normalized).size > 500 * 1024;

            if (err && !sukses) {
                const errorText = String(stderr || err.message || err);
                console.log("[LOG ERROR] FFmpeg gagal merender video:", errorText.slice(-200));
                global.videoProgress[videoId] = { status: "error", message: "Video tidak dapat diproses oleh server." };
                sendTelegram(`❌ DanzClean Error\n\nNomor:\n${nomorWa}\n\nFile:\n${fileVideo.originalname}\n\nError:\n${errorText.slice(-3500)}`);
                return;
            }

            const domainPenyedia = req.get("host");
            const protocolPenyedia = req.protocol;
            const resultUrl = `${protocolPenyedia}://${domainPenyedia}/video/${outputFilename}`;

            console.log(`[LOG BERHASIL MATANG] Hasil video siap di-download: ${resultUrl}`);

            global.videoProgress[videoId] = { status: "selesai", message: "Video HD Matang!", url: resultUrl };
            global.results.push({ url: resultUrl, nomor: nomorWa, time: Date.now() });

            setTimeout(() => {
                if (fs.existsSync(normalized)) {
                    fs.unlink(normalized, () => {});
                    console.log(`[AUTO DELETE LOG] Video dihapus dari server otomatis: ${outputFilename}`);
                }
            }, 5 * 60 * 1000);
        });

    } catch (error) {
        if (fileVideo && fs.existsSync(fileVideo.path)) fs.unlinkSync(fileVideo.path);
        console.log("[LOG CRASH ERROR RUTE UTAMA]: ", error.message);
        return kirimRespon({ status: false, error: "Internal Server Error: " + error.message });
    }
});

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
            console.log(`[LOG CHUNKING] Potongan terakhir diterima. Menjahit file video: ${filename}...`);
            
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

            console.log("[LOG CHUNKING] File video berhasil dijahit total.");

            const videoId = `vid_${Date.now()}`;
            global.videoProgress[videoId] = { status: "proses", message: "Video selesai dijahit! Memulai verifikasi..." };

            console.log("[LOG CHUNKING] Melepas respons ke frontend (Mencegah macet 49%).");
            res.json({ status: true, id: videoId, message: "File berhasil disatukan, memproses HD..." });

            console.log("[LOG BACKGROUND] Mengoper data video ke pemroses latar belakang (Express Memory Router)...");
            setImmediate(() => {
                req.file = {
                    path: finalPath,
                    originalname: filename,
                    filename: path.basename(finalPath),
                    mimetype: "video/mp4",
                    size: fs.statSync(finalPath).size
                };
                req.body.nomor = nomor;
                req.body.isFromChunk = true; 
                req.body.videoIdFlag = videoId; 

                const ruteUploadUtama = app._router.stack.find(s => s.route && s.route.path === "/upload");
                if (ruteUploadUtama) {
                    ruteUploadUtama.handle(req, res, () => {});
                } else {
                    console.log("[LOG CHUNK ERROR]: Fungsi rute /upload internal tidak ditemukan");
                }
            });
            return;
        }

        return res.json({ status: true, message: `Chunk ${chunkIndex} sukses disimpan.` });

    } catch (error) {
        console.log("[LOG CRASH ERROR CHUNKING]: ", error.message);
        return res.json({ status: false, error: "Gagal menyatukan potongan file: " + error.message });
    }
});

app.use((err, req, res, next) => {
    res.status(500).json({ status: false, error: "Internal Server Error" })
})

app.listen(process.env.PORT || 3000, () => {
    console.log("API READY")
})
