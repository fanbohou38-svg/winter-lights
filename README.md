# 🎀 WINTER LIGHTS · 冬夜之光（粉色版）

一个 **零外部资源依赖**、零构建依赖的 3D 粒子圣诞树互动网站。
上万颗发光粒子组成圣诞树，星云绽放、雪花飘落、八音盒旋律由 Web Audio 实时合成，四周环绕可点击的 3D 拍立得照片挂饰。

- 技术栈：HTML5 + CSS3（玻璃拟态）+ ES6 Modules + Three.js r187（CDN importmap）+ Web Audio API
- 后期处理：EffectComposer（HalfFloat 帧缓冲，消除暗夜色阶断层）+ UnrealBloomPass（strength 0.52 / radius 0.35 / threshold 0.78，轮廓清晰不糊屏）
- r187 规范：使用 `THREE.Timer` 替代已废弃的 `THREE.Clock`（自带页面可见性保护）
- 零构建：无需 npm / webpack / vite，任意静态服务器打开 `index.html` 即可运行

---

## 一、功能一览

| 模块 | 说明 |
| --- | --- |
| 🌸 粒子圣诞树 | 桌面 14,000 / 移动端 6,500 颗粒子，圆锥螺旋 + 分枝层叠起伏，**玫瑰粉/浅樱粉渐变 + 香槟金/月白点缀**，呼吸闪烁 + 布朗漂浮 |
| ✨ 粒子绽放 / 聚合 | 一键在「圣诞树 ⇄ 星云」间切换：绽放态星系公转，聚合态螺旋向心归位，中途可随时反向打断，照片卡片同步优雅外扩/归位 |
| 📷 照片记忆挂饰 | 初始 6 张内置 Canvas 程序化绘制的冬日祝福拍立得卡；「上传照片」支持**一次多张**（浏览器本地处理，绝不联网上传），卡片带金色边框与微光，环绕圣诞树缓慢公转 |
| 🔍 点击看大图 | Raycaster 点击任意照片卡片（自动区分拖拽与点击），弹出玻璃拟态大图预览，支持上一张/下一张、点击空白/✕/Esc 关闭 |
| 💡 彩灯模式 | 玫瑰暖金 / 星樱幻彩 / 静谧月白 三种模式循环 |
| ❄️ 飘雪 | 2,000 颗雪花（低端 1,100），世界单位细腻尺寸、随机大小与终端速度、正弦风场摇曳、触底无缝重置，可开关 |
| 🌌 深空星海 | 3,000 颗粉紫多色温恒星随机闪烁 + 粉/紫星云光晕 |
| 🎵 背景音乐 | 点「♪ 音乐」播放 Web Audio 合成的《平安夜》八音盒旋律（公版，零版权风险，循环+音量可调）；也可点「🎵 上传音乐」换成本地音频（MP3/OGG/WAV 等）循环播放，只在浏览器内处理 |
| 🎁 立体装饰 | 树顶玫瑰金五角星（点光源+光晕+光环）、粉金螺旋流光灯带、金属装饰球、54 颗闪烁彩灯、发光同心圆底座、丝带礼物盒 |
| 🎥 交互 | OrbitControls 拖拽旋转 + 滚轮/双指缩放（阻尼惯性），拖拽时暂停自动巡航、松手 2 秒恢复，重置视角平滑复位 |
| ⚡ 性能 | BufferGeometry + 着色器运动（零 CPU 粒子更新）、零 GC 主循环、DPR 上限 2、FPS < 30 自动降分辨率、`visibilitychange` 后台自动暂停渲染与音频 |

## 二、本地运行

ES Modules 需要通过 HTTP 访问（直接双击 index.html 会因 CORS 报错），任选其一：

**方式 A · VS Code Live Server（推荐）**
1. VS Code 安装「Live Server」扩展
2. 右键 `index.html` → **Open with Live Server**

**方式 B · Python 静态服务器**
```bash
cd winter-lights
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

**方式 C · Node 静态服务器**
```bash
npx http-server winter-lights -p 8000
```

## 三、GitHub Pages 免费部署

1. 在 GitHub 新建仓库（如 `winter-lights`），上传本项目全部文件：

```bash
cd winter-lights
git init
git add .
git commit -m "feat: winter lights pink edition with photo cards"
git branch -M main
git remote add origin https://github.com/<用户名>/winter-lights.git
git push -u origin main
```

2. 仓库页 → **Settings → Pages** → Source 选 `Deploy from a branch`，Branch 选 `main` / `(root)`，保存。
3. 1–2 分钟后访问 `https://<用户名>.github.io/winter-lights/` 即可分享。

> 也可以用 Vercel / Netlify：导入仓库后零配置直接部署（无需构建命令）。

## 四、目录结构

```text
winter-lights/
├── index.html            # importmap（CDN Three.js）、Google Fonts、UI + 照片预览弹窗
├── css/
│   └── style.css         # 粉色玻璃拟态控制栏、预览弹窗、移动端适配
├── js/
│   ├── main.js           # 场景/相机/后期、渲染主循环、Raycaster 点击、照片弹窗
│   ├── particles.js      # 万级粒子树缓冲几何、绽放/聚合状态机、迷你缓动引擎
│   ├── christmas-tree.js # 五角星/流光灯带/装饰球/彩灯/底座/礼物盒
│   ├── photos.js         # 3D 拍立得照片卡片（默认占位卡 + 多图上传 + 点击检测）
│   ├── snow.js           # 雪花系统 + 深空星海
│   ├── music.js          # 双模式音乐引擎：本地/内置曲目播放 + Web Audio 八音盒《平安夜》合成
│   └── controls.js       # OrbitControls 封装 + UI 事件绑定 + 相机复位
└── README.md
```

## 五、常见调整

- **改粒子数量**：`js/main.js` 中 `COUNTS.tree`
- **改树的高度/半径**：`js/particles.js` 顶部 `TREE_H / TREE_R`
- **改配色**：`js/particles.js` 中的 `cDeep / cLight / cGold / cIce` 与 `js/christmas-tree.js` 的 `ballColors` / `lightPalette`
- **改辉光强度**：`js/main.js` 中 `UnrealBloomPass` 的 strength / radius / threshold
- **改默认占位卡寄语**：`js/photos.js` 中 `DEFAULT_CAPTIONS`
- **换旋律**：`js/music.js` 中 `MELODY`（[拍, MIDI 音高, 时值拍] 数组）
- ⚠️ **版权提醒**：本公开部署版本已移除版权曲《Last Christmas》(Wham!)（原素材 `assets/audio/last-christmas.mp3`），音乐改为 Web Audio 合成的公版旋律。若要换歌，请只上传自己拥有版权或明确允许公开传播的音频（例如公版、CC0、自录音源）

## 六、常见问题

- **打开空白/报 CORS 错误？** 必须通过静态服务器访问（见第二节），不能 file:// 直开。
- **CDN 加载慢？** importmap 中的 jsdelivr 地址可替换为 unpkg 或自行托管的三份文件（`three.module.js` 与 `examples/jsm/` 目录）。
- **手机发热？** 已内置低功耗模式（粒子 6,500、DPR ≤ 1.5），持续低于 30 FPS 会再自动降级。
- **照片会传到网上吗？** 不会。照片全部在浏览器本地读取并绘制成纹理，页面没有任何上传逻辑。
