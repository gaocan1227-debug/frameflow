import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataRoot } from './store.mjs';

const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-6000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stderr) : reject(Error(`${path.basename(command)} 失败 (${code}): ${stderr.slice(-1600)}`)));
  });
}

export async function mediaInfo(file) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]);
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(Error(stderr)));
  });
  return JSON.parse(output);
}

const srtTime = seconds => {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

export async function renderEpisode(project, episode) {
  if (!episode.shots.length) throw Object.assign(Error('先添加镜头'), { status: 400 });
  for (const shot of episode.shots) {
    if (!shot.assetId || !project.assets.some(asset => asset.id === shot.assetId && ['image', 'video'].includes(asset.kind))) {
      throw Object.assign(Error(`第 ${shot.number} 镜缺少图片或视频素材`), { status: 400 });
    }
  }
  const width = project.format === '16:9' ? 1280 : 720;
  const height = project.format === '16:9' ? 720 : 1280;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameflow-render-'));
  try {
    const segmentPaths = [];
    for (let i = 0; i < episode.shots.length; i++) {
      const shot = episode.shots[i];
      const asset = project.assets.find(item => item.id === shot.assetId);
      const input = path.join(dataRoot, 'assets', asset.file);
      const segment = path.join(temp, `${String(i).padStart(3, '0')}.mp4`);
      const scale = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`;
      const args = asset.kind === 'image'
        ? ['-y', '-loop', '1', '-framerate', '30', '-i', input, '-t', String(shot.duration)]
        : ['-y', '-stream_loop', '-1', '-i', input, '-t', String(shot.duration)];
      args.push('-vf', scale, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30', '-pix_fmt', 'yuv420p', segment);
      await run(ffmpeg, args);
      segmentPaths.push(segment);
    }
    const concat = path.join(temp, 'concat.txt');
    fs.writeFileSync(concat, segmentPaths.map(p => `file '${p.replaceAll("'", "'\\''")}'`).join('\n'));
    const joined = path.join(temp, 'joined.mp4');
    await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', joined]);
    let timeline = 0, n = 0, captions = '';
    for (const shot of episode.shots) {
      if (shot.dialogue) {
        captions += `${++n}\n${srtTime(timeline + 0.15)} --> ${srtTime(timeline + shot.duration - 0.15)}\n${shot.dialogue.replaceAll(/\r?\n/g, ' ')}\n\n`;
      }
      timeline += shot.duration;
    }
    const srt = path.join(temp, 'captions.srt');
    fs.writeFileSync(srt, captions);
    const outputName = `${project.id}-${episode.id}-${randomUUID()}.mp4`;
    const output = path.join(dataRoot, 'exports', outputName);
    const args = ['-y', '-i', joined, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
    if (n) {
      // A relative path avoids FFmpeg filter escaping differences on Windows.
      args.push('-vf', 'subtitles=captions.srt');
    }
    args.push('-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', output);
    await run(ffmpeg, args, temp);
    const info = await mediaInfo(output);
    const duration = Number(info.format?.duration || 0);
    if (!info.streams?.some(item => item.codec_type === 'video') || !info.streams?.some(item => item.codec_type === 'audio') || Math.abs(duration - timeline) > 0.5) {
      fs.rmSync(output, { force: true });
      throw Error('导出校验失败：音视频轨或时长不符');
    }
    return { file: outputName, width, height, duration };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
