/* ============================================================
   photos.js — 3D 照片记忆挂饰（拍立得卡片）
   - 支持默认挂载本地照片（assets/photos/，随项目部署）
   - 支持一次选择多张本地照片（浏览器本地处理，不上传任何服务器）
   - 加载失败的槽位自动回退为内置 Canvas 绘制的冬日祝福占位卡
   - 卡片带精致金色边框与微光，螺旋环绕圣诞树缓慢公转
   - 绽放时优雅外扩漂浮 / 聚合时受引力般归位（指数平滑，随时可打断）
   - 提供 raycast 点击检测（供 main.js 弹出大图预览）
   ============================================================ */
import * as THREE from 'three';
import { TREE_H, TREE_R, TREE_BASE_Y } from './particles.js';

/* ---------- 程序化绘制拍立得卡片纹理（512 × 640） ---------- */
const CARD_W = 512, CARD_H = 640;
const PAD = 26;                    // 白边宽度
const PHOTO_H = 440;               // 照片区高度
const CAPTION_AREA = CARD_H - PAD - PHOTO_H - PAD;

/* 六张内置冬日祝福卡的画法（按变体索引区分画面主题） */
function drawScene(ctx, variant, w, h) {
  const palettes = [
    ['#3a0f2e', '#8e2a5e'], ['#2a1038', '#7a2f8e'], ['#141d3a', '#5e2a6e'],
    ['#40142a', '#a03c68'], ['#1e0f30', '#6e3a9e'], ['#33122e', '#9e4a7e']
  ];
  const [c0, c1] = palettes[variant % palettes.length];
  // 夜空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, c0); sky.addColorStop(1, c1);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 星星
  ctx.fillStyle = 'rgba(255,240,250,0.9)';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w, y = Math.random() * h * 0.72;
    const r = Math.random() * 1.6 + 0.4;
    ctx.globalAlpha = 0.4 + Math.random() * 0.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 月亮
  ctx.fillStyle = 'rgba(255,225,240,0.95)';
  ctx.beginPath(); ctx.arc(w * 0.76, h * 0.2, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.arc(w * 0.72, h * 0.18, 22, 0, Math.PI * 2); ctx.fill();

  // 按变体绘制主题图案
  ctx.save();
  if (variant % 6 === 0 || variant % 6 === 3) {
    // 小圣诞树
    for (let k = 0; k < 3; k++) {
      const tw = 54 - k * 12, ty = h * 0.62 + k * 30;
      ctx.fillStyle = ['#ff8fb8', '#c084fc', '#f7c873'][k % 3];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, ty - 44); ctx.lineTo(w * 0.5 - tw / 2, ty); ctx.lineTo(w * 0.5 + tw / 2, ty);
      ctx.closePath(); ctx.fill();
    }
  } else if (variant % 6 === 1 || variant % 6 === 4) {
    // 极光波带
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = ['rgba(255,143,184,0.5)', 'rgba(192,132,252,0.45)', 'rgba(247,200,115,0.4)'][k];
      ctx.lineWidth = 16;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * (0.3 + k * 0.09) + Math.sin(x * 0.02 + k * 2) * 22;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    // 飘落的爱心与雪花
    ctx.font = '38px serif'; ctx.textAlign = 'center';
    const glyphs = ['❤', '❄', '✦', '♡'];
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = ['rgba(255,170,205,0.85)', 'rgba(230,200,255,0.8)', 'rgba(255,240,250,0.8)'][i % 3];
      ctx.fillText(glyphs[i % 4], Math.random() * w, Math.random() * h * 0.75 + 30);
    }
  }
  ctx.restore();

  // 雪丘
  ctx.fillStyle = 'rgba(255,235,245,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(w * 0.3, h * 0.86, w * 0.55, h * 0.93);
  ctx.quadraticCurveTo(w * 0.8, h * 0.98, w, h * 0.9);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
}

/* 生成一张拍立得卡片纹理：白框 + 金色描边 + 照片区 + 底部寄语 */
function makePolaroidTexture(painter, caption) {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext('2d');

  // 白色卡纸（微微暖粉）
  g.fillStyle = '#fff9fc';
  g.fillRect(0, 0, CARD_W, CARD_H);
  // 金色外描边
  g.strokeStyle = 'rgba(212,165,90,0.9)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, CARD_W - 6, CARD_H - 6);
  // 照片区域内衬金色细边
  g.strokeStyle = 'rgba(212,165,90,0.55)';
  g.lineWidth = 3;
  g.strokeRect(PAD - 5, PAD - 5, CARD_W - PAD * 2 + 10, PHOTO_H + 10);

  // 照片区（裁剪绘制）
  g.save();
  g.beginPath();
  g.rect(PAD, PAD, CARD_W - PAD * 2, PHOTO_H);
  g.clip();
  painter(g, CARD_W - PAD * 2, PHOTO_H);
  g.restore();

  // 底部寄语（手写感衬线）
  g.fillStyle = '#b0487e';
  g.font = 'italic 34px "Noto Serif SC", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(caption, CARD_W / 2, PAD + PHOTO_H + CAPTION_AREA / 2 - 6);
  // 小装饰线
  g.strokeStyle = 'rgba(212,165,90,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(CARD_W / 2 - 70, PAD + PHOTO_H + CAPTION_AREA - 26);
  g.lineTo(CARD_W / 2 + 70, PAD + PHOTO_H + CAPTION_AREA - 26);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, fullSrc: c.toDataURL('image/png') };
}

/* 卡片背纹（双面卡片共用一张）：粉色夜空 + 雪花爱心 + WINTER LIGHTS 字样 */
function makeCardBackTexture() {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext('2d');

  // 粉紫夜空渐变
  const sky = g.createLinearGradient(0, 0, 0, CARD_H);
  sky.addColorStop(0, '#3a0f2e'); sky.addColorStop(0.55, '#6e2160'); sky.addColorStop(1, '#9e3a78');
  g.fillStyle = sky;
  g.fillRect(0, 0, CARD_W, CARD_H);

  // 星星与雪花爱心
  const glyphs = ['❄', '✦', '♡', '❤'];
  for (let i = 0; i < 40; i++) {
    g.fillStyle = ['rgba(255,240,250,0.85)', 'rgba(255,190,220,0.8)', 'rgba(230,200,255,0.75)'][i % 3];
    g.globalAlpha = 0.35 + Math.random() * 0.5;
    if (i % 5 === 0) {
      g.font = `${20 + Math.random() * 16}px serif`;
      g.fillText(glyphs[(Math.random() * glyphs.length) | 0], Math.random() * CARD_W, Math.random() * CARD_H);
    } else {
      g.beginPath();
      g.arc(Math.random() * CARD_W, Math.random() * CARD_H, Math.random() * 1.6 + 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;

  // 中央文字
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,228,242,0.96)';
  g.font = 'bold 52px Cinzel, serif';
  g.fillText('WINTER', CARD_W / 2, CARD_H * 0.38);
  g.fillText('LIGHTS', CARD_W / 2, CARD_H * 0.5);
  g.font = 'italic 34px "Noto Serif SC", serif';
  g.fillStyle = 'rgba(255,205,230,0.92)';
  g.fillText('冬 夜 之 光 · 心 之 忆', CARD_W / 2, CARD_H * 0.64);
  // 装饰分隔线
  g.strokeStyle = 'rgba(212,165,90,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(CARD_W * 0.3, CARD_H * 0.72); g.lineTo(CARD_W * 0.7, CARD_H * 0.72);
  g.stroke();

  // 金色内外描边（与正面呼应）
  g.strokeStyle = 'rgba(212,165,90,0.9)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, CARD_W - 6, CARD_H - 6);
  g.strokeStyle = 'rgba(212,165,90,0.5)';
  g.lineWidth = 3;
  g.strokeRect(18, 18, CARD_W - 36, CARD_H - 36);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const DEFAULT_CAPTIONS = [
  'Merry Christmas ✨',
  '冬夜有光 · 心中有你',
  '愿所有美好如期而至',
  '永远热爱 永远浪漫',
  'Season of Light 🕯',
  '你比雪更温柔'
];

/* ---------- 照片卡片管理器 ---------- */
export class PhotoCards {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera  用于 billboard 与 raycast
   * @param {string[]|null} [initialPhotos] 默认挂载的本地照片路径列表
   *        （相对 index.html，如 './assets/photos/photo-01.jpg'）
   */
  constructor(scene, camera, initialPhotos = null) {
    this.scene = scene;
    this.camera = camera;
    this.spin = new THREE.Group();      // 承载公转
    scene.add(this.spin);
    this.cards = [];                    // { mesh, group, home, away, angle, radius, y, phase, fullSrc, caption }
    this.explodeK = 0;                  // 0 聚合 / 1 绽放（指数平滑，可随时打断）
    this.explodeTarget = 0;
    this.maxCards = 30;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmpV = new THREE.Vector3();
    this._backTex = makeCardBackTexture();   // 双面卡片共用背纹

    if (initialPhotos && initialPhotos.length) {
      // 默认挂载本地真实照片；某张加载失败时该槽位回退为占位卡
      initialPhotos.forEach((src, i) => {
        this.addFromUrl(src, null).then((ok) => {
          if (!ok) this._addPlaceholder(i);
        });
      });
    } else {
      DEFAULT_CAPTIONS.forEach((cap, i) => this._addPlaceholder(i));
    }
  }

  /** 内置占位卡（Canvas 程序化绘制） */
  _addPlaceholder(variant) {
    const cap = DEFAULT_CAPTIONS[variant % DEFAULT_CAPTIONS.length];
    const { texture, fullSrc } = makePolaroidTexture(
      (g, w, h) => drawScene(g, variant, w, h), cap
    );
    this._addCard(texture, fullSrc, cap);
  }

  /** 从项目内路径加载一张照片（异步）。成功返回 true */
  addFromUrl(src, caption = null) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (this.cards.length >= this.maxCards) { resolve(false); return; }
        const cap = caption || `我们的回忆 · ${this.cards.length + 1} ♥`;
        const { texture, fullSrc } = makePolaroidTexture((g, w, h) => {
          // cover 裁剪：保持比例居中填满照片区
          const s = Math.max(w / img.width, h / img.height);
          const dw = img.width * s, dh = img.height * s;
          g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        }, cap);
        this._addCard(texture, fullSrc, cap);
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = encodeURI(src);
    });
  }

  /** 构建一张卡片：金色背板 + 微光 + 拍立得照片面片 */
  _addCard(texture, fullSrc, caption) {
    if (this.cards.length >= this.maxCards) return false;
    const n = this.cards.length;

    const group = new THREE.Group();
    // 暗金色边框背板（略大于照片，金属质感）
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(1.14, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0xd9a44f, metalness: 0.75, roughness: 0.25,
        emissive: 0xf59e0b, emissiveIntensity: 0.28, side: THREE.DoubleSide
      })
    );
    frame.position.z = -0.012;
    // 拍立得照片面片（双面结构：正面照片 / 背面装饰纹，绕 Y 轴翻转避免镜像）
    // Raycaster 检测正面面片
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 1.32),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    );
    mesh.position.z = 0.01;
    const backMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 1.32),
      new THREE.MeshBasicMaterial({ map: this._backTex, toneMapped: false })
    );
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -0.01;
    // 卡片后方的柔和微光
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
        grd.addColorStop(0, 'rgba(255,170,205,0.5)');
        grd.addColorStop(1, 'rgba(255,170,205,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })(),
      transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.scale.setScalar(2.1);
    glow.position.z = -0.05;

    group.add(frame, mesh, backMesh, glow);
    this.spin.add(group);

    // 沿树冠轮廓螺旋悬挂：径向位置 = 当前高度树冠表面外扩 0.55，高度 1.2~7.2
    const angle = (n / 6) * Math.PI * 2 + Math.random() * 0.5;
    const y = 1.2 + (n % 5) * 1.5 + Math.random() * 0.3;
    const hNorm = Math.min(0.92, Math.max(0, (y - TREE_BASE_Y) / TREE_H));
    const radius = TREE_R * (1 - hNorm) * 1.04 + 0.55;
    const home = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    // 绽放态：向外扩散至半径 6.5~14 的星云区并向上漂浮
    const rExplode = 6.5 + Math.random() * 7.5;
    const away = new THREE.Vector3(
      Math.cos(angle) * rExplode,
      y + 5 + Math.random() * 4,
      Math.sin(angle) * rExplode
    );

    this.cards.push({ mesh, group, home, away, angle, radius, y, phase: Math.random() * Math.PI * 2, fullSrc, caption });
    return true;
  }

  /** 上传本地照片（浏览器本地处理，绝不联网）。返回成功张数 */
  addFiles(fileList) {
    let added = 0;
    for (const file of fileList) {
      if (!/^image\/(png|jpeg|webp|gif|bmp)$/i.test(file.type)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const caption = `我们的回忆 · ${this.cards.length + 1} ♥`;
          const { texture, fullSrc } = makePolaroidTexture((g, w, h) => {
            // cover 裁剪：保持比例居中填满照片区
            const s = Math.max(w / img.width, h / img.height);
            const dw = img.width * s, dh = img.height * s;
            g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          }, caption);
          this._addCard(texture, fullSrc, caption);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      added++;
      if (this.cards.length + added >= this.maxCards) break;
    }
    return added;
  }

  /** 绽放 / 聚合切换（指数平滑逼近目标，中途切换无跳变） */
  setExplode(target) {
    this.explodeTarget = target ? 1 : 0;
  }

  /** Raycaster 点击检测：返回命中的卡片索引，未命中返回 -1 */
  pick(clientX, clientY) {
    if (!this.cards.length) return -1;
    this._ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const hits = this._ray.intersectObjects(this.cards.map(c => c.mesh), false);
    if (!hits.length) return -1;
    return this.cards.findIndex(c => c.mesh === hits[0].object);
  }

  getCard(i) {
    return this.cards[i] || null;
  }

  update(t, dt) {
    // 整体公转
    this.spin.rotation.y += dt * 0.12;
    // 绽放系数指数平滑（天然支持中途反向）
    this.explodeK += (this.explodeTarget - this.explodeK) * Math.min(1, dt * 1.5);
    const k = this.explodeK;

    for (const card of this.cards) {
      // 位置：家 ⇄ 绽放点 插值 + 轻微上下漂浮
      this._tmpV.lerpVectors(card.home, card.away, k);
      this._tmpV.y += Math.sin(t * 0.9 + card.phase) * 0.22;
      card.group.position.copy(this._tmpV);
      // 始终朝向相机（billboard），阅读体验最佳；
      // 绽放态叠加缓慢翻滚（k 越大摆幅越大），翻到背面时可见 WINTER LIGHTS 背纹
      card.group.quaternion.copy(this.camera.quaternion);
      if (k > 0.02) {
        card.group.rotateY(Math.sin(t * 0.55 + card.phase * 2.0) * 0.85 * k);
        card.group.rotateX(Math.cos(t * 0.4 + card.phase) * 0.3 * k);
      }
    }
  }

  dispose() {
    for (const card of this.cards) {
      card.group.children.forEach((m) => {
        if (m.isMesh) {                    // Sprite 共享内置几何体，不可 dispose
          m.geometry.dispose();
          m.material.map?.dispose();
          m.material.dispose();
        } else if (m.isSprite) {
          m.material.map?.dispose();
          m.material.dispose();
        }
      });
    }
    this._backTex?.dispose();
    this.spin.removeFromParent();
  }
}
