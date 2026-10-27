import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const dataRoot = path.resolve(process.env.FRAMEFLOW_DATA_DIR || path.join(process.cwd(), 'data'));
const statePath = path.join(dataRoot, 'projects.json');

function ensureRoot() {
  fs.mkdirSync(path.join(dataRoot, 'assets'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(dataRoot, 'exports'), { recursive: true, mode: 0o700 });
}

export function loadState() {
  ensureRoot();
  if (!fs.existsSync(statePath)) return { schemaVersion: 1, projects: [] };
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state.schemaVersion !== 1 || !Array.isArray(state.projects)) throw Error('项目数据库格式不受支持');
  return state;
}

export function saveState(state) {
  ensureRoot();
  const temp = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, statePath);
}

export function mutate(fn) {
  const state = loadState();
  const result = fn(state);
  saveState(state);
  return result;
}

export function getProject(state, id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) throw Object.assign(Error('项目不存在'), { status: 404 });
  return project;
}

export function cleanText(value, max = 20000) {
  if (typeof value !== 'string') throw Object.assign(Error('需要文本'), { status: 400 });
  const text = value.trim();
  if (text.length > max) throw Object.assign(Error(`文本不能超过 ${max} 字`), { status: 400 });
  return text;
}

export function createProject(state, input) {
  const title = cleanText(input.title, 160);
  if (!title) throw Object.assign(Error('请填写项目名称'), { status: 400 });
  const project = {
    id: randomUUID(), title, format: input.format === '16:9' ? '16:9' : '9:16',
    style: cleanText(input.style || '', 2000), idea: cleanText(input.idea || '', 10000),
    characters: [], episodes: [], assets: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  state.projects.unshift(project);
  return project;
}

export function addEpisode(project, input) {
  const episode = {
    id: randomUUID(), number: project.episodes.length + 1,
    title: cleanText(input.title || `第 ${project.episodes.length + 1} 集`, 160),
    script: cleanText(input.script || '', 100000), shots: [],
  };
  project.episodes.push(episode);
  project.updatedAt = new Date().toISOString();
  return episode;
}

export function getEpisode(project, episodeId) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw Object.assign(Error('剧集不存在'), { status: 404 });
  return episode;
}

export function addShot(project, episode, input) {
  const duration = Number(input.duration);
  if (!Number.isFinite(duration) || duration < 1 || duration > 30) throw Object.assign(Error('镜头时长须为 1–30 秒'), { status: 400 });
  const shot = {
    id: randomUUID(), number: episode.shots.length + 1,
    description: cleanText(input.description || '', 2000), dialogue: cleanText(input.dialogue || '', 500),
    videoPrompt: cleanText(input.videoPrompt || '', 5000), duration,
    assetId: input.assetId || null,
  };
  episode.shots.push(shot);
  project.updatedAt = new Date().toISOString();
  return shot;
}

export function splitChapters(text) {
  const source = cleanText(text, 1_000_000);
  const lines = source.split(/\r?\n/);
  const chapters = [];
  for (const line of lines) {
    if (/^\s*(第[一二三四五六七八九十百千万零〇0-9]+[章节回]|Chapter\s+\d+)/i.test(line)) {
      chapters.push({ title: line.trim(), text: '' });
    } else {
      if (!chapters.length) chapters.push({ title: '第一章', text: '' });
      chapters.at(-1).text += `${line}\n`;
    }
  }
  return chapters.filter(item => item.text.trim()).map(item => ({ title: item.title, text: item.text.trim() }));
}
