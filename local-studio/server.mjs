import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadState, mutate, getProject, getEpisode, createProject, addEpisode, addShot, splitChapters, cleanText, dataRoot } from './store.mjs';
import { renderEpisode } from './render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT 必须是有效端口');
const json = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
};

async function body(req, limit = 60 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(Error('上传内容过大'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(Error('JSON 格式无效'), { status: 400 }); }
}

function sendFile(res, file, mime) {
  if (!fs.existsSync(file)) throw Object.assign(Error('文件不存在'), { status: 404 });
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

const mediaKinds = { 'image/png': ['image', '.png'], 'image/jpeg': ['image', '.jpg'], 'image/webp': ['image', '.webp'], 'video/mp4': ['video', '.mp4'], 'audio/mpeg': ['audio', '.mp3'], 'audio/wav': ['audio', '.wav'] };
const touch = project => { project.updatedAt = new Date().toISOString(); };

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', mode: 'local-open-source' });
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, loadState());
    if (req.method === 'GET' && parts[0] === 'assets' && parts.length === 2) {
      const state = loadState();
      const asset = state.projects.flatMap(project => project.assets).find(item => item.id === parts[1]);
      if (!asset) throw Object.assign(Error('素材不存在'), { status: 404 });
      return sendFile(res, path.join(dataRoot, 'assets', asset.file), asset.mime);
    }
    if (req.method === 'GET' && parts[0] === 'exports' && parts.length === 2 && /^[\w-]+\.mp4$/.test(parts[1])) {
      return sendFile(res, path.join(dataRoot, 'exports', parts[1]), 'video/mp4');
    }
    if (req.method === 'GET' && !parts.length) return sendFile(res, path.join(here, 'public', 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && parts[0] === 'static' && parts.length === 2 && ['app.js', 'style.css'].includes(parts[1])) {
      return sendFile(res, path.join(here, 'public', parts[1]), parts[1].endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
    }
    if (parts[0] !== 'api' || !['POST', 'PATCH'].includes(req.method)) throw Object.assign(Error('未找到页面'), { status: 404 });
    const input = await body(req);
    if (req.method === 'POST' && url.pathname === '/api/projects') return json(res, 201, mutate(state => createProject(state, input)));
    const projectId = parts[1] === 'projects' ? parts[2] : null;
    if (!projectId) throw Object.assign(Error('未找到接口'), { status: 404 });
    if (req.method === 'PATCH' && parts.length === 3) return json(res, 200, mutate(state => {
      const project = getProject(state, projectId);
      for (const key of ['title', 'style', 'idea']) if (key in input) project[key] = cleanText(input[key], key === 'title' ? 160 : 10000);
      if (input.format) project.format = input.format === '16:9' ? '16:9' : '9:16';
      touch(project); return project;
    }));
    if (req.method === 'POST' && parts[3] === 'episodes' && parts.length === 4) return json(res, 201, mutate(state => addEpisode(getProject(state, projectId), input)));
    if (req.method === 'POST' && parts[3] === 'novel' && parts.length === 4) return json(res, 201, mutate(state => {
      const project = getProject(state, projectId);
      const chapters = splitChapters(input.text || '');
      for (const chapter of chapters) addEpisode(project, { title: chapter.title, script: chapter.text });
      return { chapters: chapters.length };
    }));
    if (req.method === 'PATCH' && parts[3] === 'episodes' && parts.length === 5) return json(res, 200, mutate(state => {
      const project = getProject(state, projectId), episode = getEpisode(project, parts[4]);
      if ('title' in input) episode.title = cleanText(input.title, 160);
      if ('script' in input) episode.script = cleanText(input.script, 100000);
      touch(project); return episode;
    }));
    if (req.method === 'POST' && parts[3] === 'episodes' && parts[5] === 'shots' && parts.length === 6) return json(res, 201, mutate(state => {
      const project = getProject(state, projectId); return addShot(project, getEpisode(project, parts[4]), input);
    }));
    if (req.method === 'PATCH' && parts[3] === 'episodes' && parts[5] === 'shots' && parts.length === 7) return json(res, 200, mutate(state => {
      const project = getProject(state, projectId), episode = getEpisode(project, parts[4]);
      const shot = episode.shots.find(item => item.id === parts[6]);
      if (!shot) throw Object.assign(Error('镜头不存在'), { status: 404 });
      for (const key of ['description', 'dialogue', 'videoPrompt']) if (key in input) shot[key] = cleanText(input[key], key === 'dialogue' ? 500 : 5000);
      if ('duration' in input) {
        const duration = Number(input.duration);
        if (!Number.isFinite(duration) || duration < 1 || duration > 30) throw Object.assign(Error('镜头时长须为 1–30 秒'), { status: 400 });
        shot.duration = duration;
      }
      if ('assetId' in input) {
        if (input.assetId && !project.assets.some(asset => asset.id === input.assetId)) throw Object.assign(Error('素材不属于此项目'), { status: 400 });
        shot.assetId = input.assetId || null;
      }
      touch(project); return shot;
    }));
    if (req.method === 'POST' && parts[3] === 'assets' && parts.length === 4) {
      const info = mediaKinds[input.mime];
      if (!info || typeof input.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw Object.assign(Error('仅支持 PNG/JPEG/WebP/MP4/MP3/WAV 文件'), { status: 400 });
      const bytes = Buffer.from(input.base64, 'base64');
      if (!bytes.length || bytes.length > 40 * 1024 * 1024) throw Object.assign(Error('文件大小须在 40 MB 以内'), { status: 400 });
      const file = `${randomUUID()}${info[1]}`;
      fs.mkdirSync(path.join(dataRoot, 'assets'), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dataRoot, 'assets', file), bytes, { mode: 0o600 });
      try {
        return json(res, 201, mutate(state => {
          const project = getProject(state, projectId);
          const asset = { id: randomUUID(), kind: info[0], mime: input.mime, name: cleanText(input.name || file, 200), file, createdAt: new Date().toISOString() };
          project.assets.push(asset); touch(project); return asset;
        }));
      } catch (error) { fs.rmSync(path.join(dataRoot, 'assets', file), { force: true }); throw error; }
    }
    if (req.method === 'POST' && parts[3] === 'episodes' && parts[5] === 'render' && parts.length === 6) {
      const state = loadState(), project = getProject(state, projectId), episode = getEpisode(project, parts[4]);
      const result = await renderEpisode(project, episode);
      return json(res, 200, result);
    }
    throw Object.assign(Error('未找到接口'), { status: 404 });
  } catch (error) { json(res, error.status || 500, { error: error.message || '服务器错误' }); }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`帧序开源本机版：http://127.0.0.1:${port}`));
}
