/**
 * mediaConverter.js
 * Uses ffmpeg-static to transcode media to formats that play natively
 * on BOTH iOS (WhatsApp) and Android (WhatsApp).
 *
 * iOS/Android WhatsApp requires:
 *   Audio → AAC in M4A container  (audio/mp4, ptt: false)
 *   Video → H.264 + AAC in MP4   (video/mp4)
 */

const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}

/**
 * Run an ffmpeg command and return a promise.
 * @param {string[]} args - ffmpeg arguments array
 * @param {number} timeoutMs - kill after this many ms (default 5 min)
 */
function runFFmpeg(args, timeoutMs = 5 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('ffmpeg timeout'));
        }, timeoutMs);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
            }
        });

        proc.on('error', err => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * Convert any audio file (MP3, OGG, WEBM, etc.) to AAC in M4A.
 * M4A with AAC plays natively on both iOS and Android WhatsApp.
 *
 * @param {string} inputPath - path to the source audio file
 * @returns {string} outputPath - path to the converted .m4a file
 */
async function convertAudioToM4A(inputPath) {
    const outputPath = inputPath.replace(/\.[^.]+$/, '') + '_converted.m4a';

    await runFFmpeg([
        '-y',                      // overwrite output
        '-i', inputPath,           // input file
        '-vn',                     // drop any video stream
        '-c:a', 'aac',            // encode to AAC
        '-b:a', '128k',           // 128kbps bitrate (good quality, small size)
        '-ar', '44100',           // 44.1kHz sample rate
        '-movflags', '+faststart', // optimise MP4 for streaming
        outputPath
    ]);

    return outputPath;
}

/**
 * Convert any video file to H.264 + AAC in MP4.
 * H.264/AAC MP4 plays natively on both iOS and Android WhatsApp.
 *
 * @param {string} inputPath - path to the source video file
 * @param {object} opts
 * @param {string} [opts.crf='28'] - Constant Rate Factor (18=best, 51=worst). 28 balances size/quality.
 * @param {string} [opts.preset='veryfast'] - encoding speed preset
 * @param {string} [opts.scale] - e.g. '480:-2' to resize to 480p width
 * @returns {string} outputPath - path to the converted .mp4 file
 */
async function convertVideoToMP4(inputPath, opts = {}) {
    const outputPath = inputPath.replace(/\.[^.]+$/, '') + '_converted.mp4';

    const {
        crf = '28',
        preset = 'veryfast',
        scale = '480:-2'          // 480p keeps file small enough for WhatsApp
    } = opts;

    await runFFmpeg([
        '-y',
        '-i', inputPath,
        '-c:v', 'libx264',         // H.264 video codec
        '-preset', preset,
        '-crf', crf,
        '-vf', `scale=${scale}`,   // resize to 480p
        '-c:a', 'aac',             // AAC audio
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        outputPath
    ], 15 * 60 * 1000);            // 15 min timeout for long videos

    return outputPath;
}

/**
 * Quick helper: read a file and delete it afterward.
 */
function readAndDelete(filePath) {
    const buf = fs.readFileSync(filePath);
    try { fs.unlinkSync(filePath); } catch {}
    return buf;
}

module.exports = {
    convertAudioToM4A,
    convertVideoToMP4,
    readAndDelete,
    tmpDir
};
