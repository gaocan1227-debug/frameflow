# 帧序 · 开源本机版

无需账号、积分、订阅、数据库服务或云端 API 的短剧／漫剧制作工作台。源码采用 MIT 许可。项目、上传素材与导出视频仅保存在本机 `data/`。

## 三步开始

1. 安装 Node.js 20 或更新版本，以及带 `libx264`、`libass` 的 FFmpeg／FFprobe。
2. 下载本仓库的 `oss-local` 分支，进入目录并执行 `npm start`。本项目没有 npm 依赖，无需先运行 `npm install`。
3. 在浏览器打开 `http://127.0.0.1:3000`，点击“＋ 新建”。

```bash
git clone --branch oss-local https://github.com/gaocan1227-debug/frameflow.git
cd frameflow
node --version
ffmpeg -version
ffprobe -version
npm start
```

**首次使用、小说导入、素材上传、逐镜配音、字幕和 MP4 导出的完整操作**见 [使用指南](docs/使用指南.md)。本分支提供的是源码和本机网页，不是下载的 GPT 版 DMG 安装包。

可用环境变量：`PORT`、`FRAMEFLOW_DATA_DIR`、`FFMPEG_BIN`、`FFPROBE_BIN`。数据目录请自行备份；`data/` 已被 Git 忽略。

## 当前功能

- 创建本机项目，设置竖屏／横屏画幅、故事梗概和视觉方向。
- 粘贴小说，按章节标题拆分剧集；也可手动编写剧本。
- 维护全剧人物和场景资料、参考图提示词，确认剧本与分镜。
- 编排镜头、画面描述和视频提示词；设置时长、素材入点和逐镜配音。
- 上传 PNG、JPEG、WebP、MP4、MP3、WAV 素材并绑定镜头。
- 编辑字幕轨及背景音乐，使用 FFmpeg 将素材按镜头顺序合成为 MP4，检查音视频轨与时长。

视频导出使用静止图片或已有视频；可混合上传的配音与配乐。此版本没有内置 AI 生图、生视频、TTS 或小说自动改编服务，上传的音频需由使用者自行准备。外部供应商的费用和授权由使用者自行负责。

## 与原有版本

原仓库 `main` 是 Manus 云端短剧方案站，含 Manus 登录、MySQL、点数与 Stripe。`oss-local` 分支将应用改为本机可运行的源码项目，不依赖这些服务。下载的 GPT 桌面版 DMG 是另一个 Next.js／SQLite／FFmpeg 实现，包内只有编译后的运行文件，因此本分支是按其本机工作流程重新实现，并非它的原始源码或逐项等价替代品。GPT 版的供应商生成、任务恢复和精细剪辑仍未在本分支实现。

## 开发与验证

运行 `npm test`。需要 FFmpeg 才能执行视频导出测试。服务仅监听 `127.0.0.1`，不暴露到局域网。
