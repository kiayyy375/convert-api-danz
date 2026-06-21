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
    const nomor = req.body.nomor

    try {
        if (!file) return res.json({ status: false, error: "File kosong" })
        if (!nomor) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.json({ status: false, error: "Nomor kosong" })
        }

        const form = new FormData()
        form.append("video", fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
        })
        form.append("nomor", nomor)

        const tokenTokenan = `Bearer ${Buffer.from("DANZZ").toString("base64")}`;


        const targetPort = process.env.PORT || 3000; 


        const responUtama = await axios.post(`http://127.0.0.1:${targetPort}/upload`, form, {
            headers: {
                ...form.getHeaders(),
                "authorization": tokenTokenan
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        })

        if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
        return res.json(responUtama.data)

    } catch (error) {
        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path)
        console.log("[DanzClean Proxy Error]: ", error.message)
        return res.json({ status: false, error: "Gagal menjembatani request: " + error.message })
    }
})
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

app.post("/upload", upload.single("video"), async (req, res) => {
    const authHeader = req.headers.authorization;
    const tokenDiharapkan = `Bearer ${Buffer.from("DANZZ").toString("base64")}`;

    if (!authHeader || authHeader !== tokenDiharapkan) {
        return res.status(403).json({ status: false, error: "Forbidden" })
    }

    const file = req.file
    const nomor = req.body.nomor

    try {
        if (!file) return res.json({ status: false, error: "File kosong" })
        if (!nomor) {
            fs.unlinkSync(file.path)
            return res.json({ status: false, error: "Nomor kosong" })
        }

const github = await axios.get(
  "https://api.github.com/repos/xyron11/cekverif/contents/verify.json",
  {
    headers: {
      Authorization: "token " + process.env.GITHUB_TOKEN,
      "Cache-Control": "no-cache"
    }
  }
)

const content = Buffer.from(
  github.data.content,
  "base64"
).toString("utf8")

const members = JSON.parse(content)

if (!members.includes(nomor)) {

    try {

        const realtime = await axios.get(
            "https://raw.githubusercontent.com/xyron11/cekverif/main/verify.json?nocache=" + Date.now(),
            {
                headers: {
                    "Cache-Control": "no-cache"
                },
                timeout: 5000
            }
        )

        const realtimeMembers = realtime.data || []

        if (!realtimeMembers.includes(nomor)) {

            fs.unlinkSync(file.path)

            return res.json({
                status: false,
                error: "Nomor tidak ada di grup mohon nomor yang anda pakai harus masuk group dulu, bisa anda pencet tombol join group untuk masuk ke group",
                join: "https://chat.whatsapp.com/BVtogIjS1hAD0qOMhJ3f6a"
            })

        }

    } catch {

        fs.unlinkSync(file.path)

        return res.json({
            status: false,
            error: "Nomor tidak ada di grup mohon nomor yang anda pakai harus masuk group dulu, bisa anda pencet tombol join group untuk masuk ke group",
            join: "https://chat.whatsapp.com/BVtogIjS1hAD0qOMhJ3f6a"
        })

    }
}

        const ext = file.originalname.split(".").pop().toLowerCase()
        const allow = ["mp4", "mov", "mkv", "avi", "webm", "m4v"]

        if (!allow.includes(ext)) {
            fs.unlinkSync(file.path)
            return res.json({ status: false, error: "Hanya file video" })
        }

        const outputFilename = `${Date.now()}_HD_DanzClean.mp4`
        const normalized = path.join(__dirname, "public", outputFilename)
        
        const durasiVideo = await dapatkanDurasiVideo(file.path);
        
        let bitrateIdeal = Math.floor(113246208 / durasiVideo); 
        
        if (bitrateIdeal > 4000000) bitrateIdeal = 4000000; 
        if (bitrateIdeal < 1200000) bitrateIdeal = 1200000; 
        
        const targetBitrateKbps = `${Math.floor(bitrateIdeal / 1000)}k`;

        console.log(`[DanzClean] Memproses video dengan target bitrate: ${targetBitrateKbps}`);
const fpsVideo = await new Promise((resolve) => {

    exec(
        `ffprobe -v 0 -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${file.path}"`,
        (err, stdout) => {

            if (err) return resolve(30)

            const rate = stdout.trim().split("/")

            if (rate.length === 2) {

                resolve(
                    Math.round(
                        Number(rate[0]) / Number(rate[1])
                    )
                )

            } else {
                resolve(30)
            }

        }
    )

})

const targetFps =
    fpsVideo > 60
        ? fpsVideo
        : 60

if (currentProcess >= MAX_PROCESS) {
    await new Promise(resolve => {
        waitingQueue.push(resolve)
    })
}

currentProcess++


        const perintahFfmpeg = `ffmpeg -i "${file.path}" -vf "scale='if(gte(iw,ih),-2,720)':'if(gte(iw,ih),720,-2)',hqdn3d=1.0:1.0:2.0:2.0,unsharp=3:3:0.4:3:3:0.4" -r ${targetFps} -c:v libx264 -preset faster -crf 17 -aq-mode 3 -colorspace bt709 -color_trc bt709 -color_primaries bt709 -maxrate 12M -bufsize 12M -pix_fmt yuv420p -threads 2 -c:a aac -b:a 128k -movflags +faststart "${normalized}"`

        const videoId = `vid_${Date.now()}`
        global.videoProgress[videoId] = { status: "proses", message: "Sedang mengompres video jadi HD..." }


        res.json({
            status: true,
            id: videoId,
            message: "Video diterima server Railway! Memulai render..."
        });


        exec(
    perintahFfmpeg,
    { maxBuffer: 1024 * 1024 * 100 },
    (err, stdout, stderr) => {
            currentProcess--;

            if (waitingQueue.length > 0) {
                const next = waitingQueue.shift();
                next();
            }

            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
const ffmpegLog = String(stderr || "")

if (
    ffmpegLog.includes("Invalid data") ||
    ffmpegLog.includes("missing picture") ||
    ffmpegLog.includes("no frame")
) {

    global.videoProgress[videoId] = {
        status: "error",
        message: "Video rusak atau file tidak lengkap."
    }

    sendTelegram(
`❌ Video Rusak

Nomor: ${nomor}

File:
${file.originalname}

FPS: ${fpsVideo}

Error:
${ffmpegLog.slice(0, 3000)}`
    )

    return
}



            const domainPenyedia = req.get("host");
            const protocolPenyedia = req.protocol;
            const resultUrl = `${protocolPenyedia}://${domainPenyedia}/video/${outputFilename}`;

            
            global.videoProgress[videoId] = { status: "selesai", message: "Video HD Matang!", url: resultUrl }

            
            global.results.push({
                url: resultUrl,
                nomor: nomor,
                time: Date.now()
            });

            console.log(`[DanzClean Sukses]: Video ${outputFilename} matang & siap dikirim oleh main.js!`);
        });

    } catch (e) {
        if (currentProcess > 0) {
            currentProcess--
        }

        if (waitingQueue.length > 0) {
            const next = waitingQueue.shift()
            next()
        }
        
        console.log("[DanzClean Catch Error]:", e.message)
        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path)
        

        if (!res.headersSent) {
            res.json({
                status: false,
                error: "Gagal memproses HD video: " + e.message
            })
        }
    }
})

app.use((err, req, res, next) => {
    res.status(500).json({ status: false, error: "Internal Server Error" })
})

app.listen(process.env.PORT || 3000, () => {
    console.log("API READY")
})
