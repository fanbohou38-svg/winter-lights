/* ============================================================
   main.js — 场景初始化 / 后期处理 / 渲染主循环 / 交互与照片预览
   - 相机 (0,4,24) fov45 看向 (0,3.5,0)，完整呈现整棵树
   - UnrealBloom 克制参数（strength .55 / radius .4 / threshold .75）
   - Raycaster 点击照片卡片 → 玻璃拟态大图预览弹窗
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ParticleTree } from './particles.js';
import { ChristmasTree } from './christmas-tree.js';
import { PhotoCards } from './photos.js';
import { Snow, Starfield } from './snow.js';
import { MusicEngine } from './music.js';
import { ControlsUI } from './controls.js';

/* ---------- 设备分级：移动端 / 低核 CPU 自动降级 ---------- */
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  || (window.innerWidth < 768 && window.matchMedia('(pointer:coarse)').matches);
const LOW_POWER = IS_MOBILE || (navigator.hardwareConcurrency || 8) <= 4;
const DPR_CAP = LOW_POWER ? 1.5 : 2;

const COUNTS = {
  tree: LOW_POWER ? 6500 : 14000,   // 圣诞树粒子
  snow: LOW_POWER ? 1100 : 2000,    // 雪花
  stars: LOW_POWER ? 1600 : 3000    // 背景恒星
};

/* ---------- 渲染器 / 场景 / 相机 ---------- */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070a);
scene.fog = new THREE.FogExp2(0x03070a, 0.022);   // 指数雾营造纵深

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 4.2, 24);   // 严禁贴近粒子内部：远机位全景构图

/* ---------- 灯光（服务金属装饰球 / 树干 / 礼物盒，柔和不抢戏） ---------- */
scene.add(new THREE.AmbientLight(0x5a4060, 1.3));
const warmLight = new THREE.PointLight(0xffb0cf, 26, 46, 1.8);
warmLight.position.set(9, 12, 10);
scene.add(warmLight);
const coolLight = new THREE.PointLight(0xc084fc, 20, 46, 1.8);
coolLight.position.set(-12, 6, 9);
scene.add(coolLight);

/* ---------- 模块装配 ---------- */
const particles = new ParticleTree(scene, COUNTS.tree);
const tree = new ChristmasTree(scene);
/* 默认挂载 assets/photos/ 下的本地照片（photo-01~12.jpg，加载失败自动回退占位卡） */
const DEFAULT_PHOTOS = Array.from({ length: 12 },
  (_, i) => `./assets/photos/photo-${String(i + 1).padStart(2, '0')}.jpg`);
const photos = new PhotoCards(scene, camera, DEFAULT_PHOTOS);
const snow = new Snow(scene, COUNTS.snow);
const stars = new Starfield(scene, COUNTS.stars);
const music = new MusicEngine();
const controls = new ControlsUI(camera, renderer.domElement);

/* ---------- UnrealBloom 后期处理（HalfFloat 帧缓冲消除暗夜色阶断层；克制参数防过爆） ---------- */
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  type: THREE.HalfFloatType,
  samples: LOW_POWER ? 0 : 4
});
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.52,    // strength
  0.35,    // radius
  0.78     // threshold：仅树顶星与灯带核心触发微光
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- UI：Toast ---------- */
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

/* ---------- 照片预览弹窗 ---------- */
const modal = document.getElementById('photo-modal');
const modalImg = document.getElementById('pm-img');
const modalCap = document.getElementById('pm-caption');
let modalIndex = -1;

function openModal(i) {
  const card = photos.getCard(i);
  if (!card) return;
  modalIndex = i;
  modalImg.src = card.fullSrc;
  modalCap.textContent = card.caption;
  modal.classList.add('open');
}
function closeModal() {
  modal.classList.remove('open');
  modalIndex = -1;
}
function stepModal(dir) {
  const n = photos.cards.length;
  if (n === 0) return;
  openModal((modalIndex + dir + n) % n);
}
document.getElementById('pm-close').addEventListener('click', closeModal);
document.getElementById('pm-prev').addEventListener('click', () => stepModal(-1));
document.getElementById('pm-next').addEventListener('click', () => stepModal(1));
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') closeModal();
  else if (e.key === 'ArrowLeft') stepModal(-1);
  else if (e.key === 'ArrowRight') stepModal(1);
});

/* ---------- Raycaster 点击照片（区分拖拽与点击：位移 < 6px 且 < 500ms） ---------- */
let downX = 0, downY = 0, downT = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const dx = e.clientX - downX, dy = e.clientY - downY;
  const moved = Math.sqrt(dx * dx + dy * dy);
  if (moved < 6 && performance.now() - downT < 500) {
    const idx = photos.pick(e.clientX, e.clientY);
    if (idx >= 0) openModal(idx);
  }
});

/* ---------- UI 绑定 ---------- */
const fileInput = document.getElementById('file-photo');
const musicInput = document.getElementById('file-music');
const btnMusic = document.getElementById('btn-music');

music.onError = (msg) => showToast(msg);
/* 内置默认曲目：《Last Christmas》(Wham!) —— 项目内本地文件，
   点「♪ 音乐」按钮即播放；加载失败自动回退八音盒合成旋律 */
music.loadUrl('./assets/audio/last-christmas.mp3');
controls.bindUI({
  onToggleBloom: (bloomed) => {
    if (bloomed) { particles.bloom(); tree.fold(true); photos.setExplode(true); showToast('粒子绽放 · 化作粉色星云'); }
    else { particles.assemble(); tree.fold(false); photos.setExplode(false); showToast('粒子聚合 · 圣诞树归位'); }
  },
  onPhotoUpload: () => fileInput.click(),
  onMusicUpload: () => musicInput.click(),
  onLights: (idx) => {
    tree.lightMode = idx;
    showToast(['玫瑰暖金', '星樱幻彩', '静谧月白'][idx]);
  },
  onSnow: (on) => snow.setEnabled(on),
  onMusic: (on) => { on ? music.start() : music.stop(); },
  onVolume: (v) => music.setVolume(v)
});
document.getElementById('btn-reset').addEventListener('click', () => controls.resetView());

/* 上传音乐：选完即自动循环播放（浏览器本地播放，不上传服务器） */
musicInput.addEventListener('change', async () => {
  const file = musicInput.files && musicInput.files[0];
  musicInput.value = '';
  if (!file) return;
  const ok = await music.loadFile(file);
  if (ok) {
    music.start();
    btnMusic.classList.add('on');
    btnMusic.textContent = '♪ 音乐 · 开';
    showToast(`正在播放：${file.name.slice(0, 24)} 🎵`);
  }
});

/* 上传照片（multiple）：浏览器本地读取，绝不联网 */
fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  fileInput.value = '';
  if (!files || !files.length) return;
  const n = photos.addFiles(files);
  showToast(n > 0 ? `已添加 ${n} 张照片挂饰 🎀` : '仅支持图片文件（JPG / PNG / WebP 等）');
});

/* ---------- 主循环（THREE.Timer 替代已废弃的 Clock；零 GC：循环内不创建对象） ---------- */
const timer = new THREE.Timer();
timer.connect(document);   // 启用 Page Visibility 保护，后台不积累大步长
let rafId = 0;
let hidden = false;

// FPS 自适应：连续低帧则降分辨率并减弱辉光
let _frames = 0, _fpsClock = 0, _degraded = false;

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (hidden) return;
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();

  controls.orbit.update();
  particles.update(t);
  tree.update(t, dt);
  photos.update(t, dt);
  snow.update(t);
  stars.update(t, dt);

  composer.render();

  // 性能监测（每 2 秒采样一次）
  _frames++; _fpsClock += dt;
  if (_fpsClock >= 2) {
    const fps = _frames / _fpsClock;
    _frames = 0; _fpsClock = 0;
    if (!_degraded && fps < 30) {
      _degraded = true;
      renderer.setPixelRatio(1);
      composer.setSize(window.innerWidth, window.innerHeight);
      bloom.strength *= 0.8;
      showToast('检测到帧率偏低，已自动优化画质');
    }
  }
}
loop();

/* ---------- 页面可见性：后台暂停渲染与音频，省电 ---------- */
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden) {
    cancelAnimationFrame(rafId);
    music.autoPause();
  } else {
    music.autoResume();
    timer.reset();   // 后台期间累积的时间差清零，恢复时无跳变
    loop();
  }
});

/* ---------- 窗口自适应 ---------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, _degraded ? 1 : DPR_CAP);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  particles.onResize(pr, h);
  tree.onResize(pr, h);
  snow.onResize(pr, h);
  stars.onResize(pr);
}
window.addEventListener('resize', onResize);
onResize();

/* ---------- 首帧渲染完成后揭幕 ---------- */
requestAnimationFrame(() => requestAnimationFrame(() => {
  const loading = document.getElementById('loading');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1200);
}));
