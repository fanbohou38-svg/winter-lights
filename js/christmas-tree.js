/* ============================================================
   christmas-tree.js — 立体装饰物（真实 3D 空间位置）
   树顶五角星 / 粉金螺旋流光灯带 / 金属装饰球 / 闪烁彩灯
   树干 / 发光同心圆底座 / 低多边形礼物盒
   注：万级粒子树冠本体在 particles.js 中，二者共享坐标系
   ============================================================ */
import * as THREE from 'three';
import { tween, easeInOutCubic } from './particles.js';
import { TREE_H, TREE_R, TREE_BASE_Y } from './particles.js';

/* 程序化发光光晕贴图 */
function glowTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grd.addColorStop(0, `rgba(${rgb},0.6)`);
  grd.addColorStop(0.45, `rgba(${rgb},0.16)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 五角星轮廓 */
function starShape(outer = 1, inner = 0.42) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

export const LIGHT_MODES = ['warm', 'aurora', 'ice'];
const LIGHT_LABELS = { warm: '玫瑰金', aurora: '星樱', ice: '月白' };

export class ChristmasTree {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lightMode = 0;   // 0 玫瑰金 / 1 星樱 / 2 月白
    this.folded = false;  // 绽放态时装饰物收起
    this._foldTween = null;
    this._tmpColor = new THREE.Color();
    this.build();
  }

  build() {
    const G = this.group;
    const std = (color, { metalness = 0.2, roughness = 0.5, emissive = 0x000000, ei = 0 } = {}) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: ei });

    /* ---- 树干 ---- */
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.52, 1.6, 20),
      std(0x5c3a4a, { roughness: 0.9 })
    );
    trunk.position.y = 1.0;
    G.add(trunk);

    /* ---- 科技感底座：圆盘 + 发光同心圆环 ---- */
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.6, 0.3, 48),
      std(0x1a0b14, { metalness: 0.6, roughness: 0.35, emissive: 0x3a0a24, ei: 0.45 })
    );
    disc.position.y = 0.15;
    G.add(disc);

    this.rings = [];
    const ringSpecs = [
      { r: 6.0, color: 0xff7eb3 }, { r: 7.0, color: 0xf7c873 }, { r: 8.0, color: 0xc084fc }
    ];
    ringSpecs.forEach((s, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(s.r, 0.035, 8, 96),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.32 + i * 0.015;
      G.add(ring);
      this.rings.push(ring);
    });

    /* ---- 树顶五角星：挤压几何体 + 点光源 + 光晕 + 旋转光环（玫瑰金） ---- */
    const starGeo = new THREE.ExtrudeGeometry(starShape(0.8, 0.36), {
      depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2
    });
    starGeo.center();
    this.star = new THREE.Mesh(starGeo, std(0xffb6d5, { metalness: 0.6, roughness: 0.25, emissive: 0xff6aa8, ei: 1.8 }));
    this.star.position.y = TREE_BASE_Y + TREE_H + 0.45;
    G.add(this.star);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('255, 150, 195'), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.setScalar(3.8);
    halo.position.copy(this.star.position);
    G.add(halo);
    this.starHalo = halo;

    this.starLight = new THREE.PointLight(0xffa3c9, 22, 26, 1.8);
    this.starLight.position.copy(this.star.position);
    G.add(this.starLight);

    this.starRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.02, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0xffc2de, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.starRing.position.copy(this.star.position);
    G.add(this.starRing);

    /* ---- 粉金螺旋流光灯带（1,200 颗，盘绕 6.5 圈，贴合树冠外扩 1.04 倍半径） ---- */
    const RIB_N = 1200;
    const ribPos = new Float32Array(RIB_N * 3);
    const ribT = new Float32Array(RIB_N);
    const ribS = new Float32Array(RIB_N);
    for (let i = 0; i < RIB_N; i++) {
      const s = i / RIB_N;
      const turns = 6.5;
      const a = s * Math.PI * 2 * turns + 1.2;
      const r = TREE_R * (1 - s) * 1.04 + 0.06;             // 贴合树冠外扩 1.04 倍
      const y = TREE_BASE_Y + s * TREE_H;
      ribPos[i * 3] = Math.cos(a) * r;
      ribPos[i * 3 + 1] = y;
      ribPos[i * 3 + 2] = Math.sin(a) * r;
      ribT[i] = s;
      ribS[i] = 0.045 + Math.random() * 0.05;   // 世界单位 0.045~0.095
    }
    const ribGeo = new THREE.BufferGeometry();
    ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
    ribGeo.setAttribute('aT', new THREE.BufferAttribute(ribT, 1));
    ribGeo.setAttribute('aSize', new THREE.BufferAttribute(ribS, 1));
    this.ribbonMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1000 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: glowTexture('255, 185, 215') }
      },
      vertexShader: /* glsl */`
        attribute float aT;
        attribute float aSize;
        uniform float uTime;
        uniform float uScale;
        uniform float uPixelRatio;
        varying float vB;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // 流光：脉冲沿灯带传播
          vB = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.6 - aT * 22.0), 2.0);
          gl_PointSize = aSize * uScale * uPixelRatio * (0.7 + vB * 0.6) / -mv.z;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying float vB;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 col = mix(vec3(1.0, 0.52, 0.76), vec3(1.0, 0.86, 0.94), vB);
          gl_FragColor = vec4(col * (0.7 + vB * 0.5), tex.a * vB * 0.85);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    G.add(new THREE.Points(ribGeo, this.ribbonMat));

    /* ---- 金属装饰球（玫瑰粉 / 香槟金 / 梦幻紫，48 颗，半径 0.14~0.22） ---- */
    const ballColors = [0xff5fa8, 0xf7c873, 0xc084fc];
    const ballGeo = new THREE.SphereGeometry(1, 20, 20);
    for (let i = 0; i < 48; i++) {
      const t = 0.08 + Math.random() * 0.8;
      const r = TREE_R * (1 - t) * 1.02;
      const a = Math.random() * Math.PI * 2;
      const size = 0.14 + Math.random() * 0.08;
      const ball = new THREE.Mesh(ballGeo, std(ballColors[i % 3], {
        metalness: 0.85, roughness: 0.15, emissive: ballColors[i % 3], ei: 0.25
      }));
      ball.scale.setScalar(size);
      ball.position.set(Math.cos(a) * r, TREE_BASE_Y + t * TREE_H, Math.sin(a) * r);
      G.add(ball);
    }

    /* ---- 闪烁彩灯（6 组共享材质，便于模式切换） ---- */
    this.lightMats = [];
    const lightPalette = [0xffc2de, 0xff9ec7, 0xffe4f0, 0xd9a7ff, 0xffd9a8, 0xffb3d9];
    for (let gI = 0; gI < 6; gI++) {
      this.lightMats.push(new THREE.MeshBasicMaterial({
        color: lightPalette[gI], transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      }));
    }
    const bulbGeo = new THREE.SphereGeometry(0.065, 8, 8);
    for (let i = 0; i < 54; i++) {
      const t = 0.05 + Math.random() * 0.88;
      const r = TREE_R * (1 - t) * 1.04;
      const a = i * 2.399963;   // 黄金角均匀分布
      const bulb = new THREE.Mesh(bulbGeo, this.lightMats[i % 6]);
      bulb.position.set(Math.cos(a) * r, TREE_BASE_Y + t * TREE_H, Math.sin(a) * r);
      G.add(bulb);
    }

    /* ---- 树底礼物盒（低多边形 + 丝带，粉紫色系，10 个） ---- */
    const giftColors = [0xd85a9a, 0x9d4edd, 0xff8fab, 0x7a3b8f, 0xe8a2c0, 0xffc2d1];
    for (let i = 0; i < 10; i++) {
      const h = 0.5 + Math.random() * 0.5;
      const w = 0.6 + Math.random() * 0.5;
      const gI = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), std(giftColors[i % 6], { roughness: 0.6 }));
      const ribbonX = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 1.02, w * 0.16), std(0xf7c873, { metalness: 0.5, roughness: 0.35, emissive: 0xf7c873, ei: 0.22 }));
      const ribbonZ = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 1.02, w * 1.02), ribbonX.material);
      gI.add(box, ribbonX, ribbonZ);
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 2.2 + Math.random() * 1.8;
      gI.position.set(Math.cos(a) * dist, h / 2 + 0.3, Math.sin(a) * dist);
      gI.rotation.y = Math.random() * Math.PI;
      G.add(gI);
    }
  }

  /** 彩灯模式：0 玫瑰金 / 1 星樱幻彩 / 2 静谧月白 */
  cycleLights() {
    this.lightMode = (this.lightMode + 1) % 3;
    return LIGHT_LABELS[LIGHT_MODES[this.lightMode]];
  }

  /** 绽放时收起装饰物 / 聚合时展开（缩放过渡，无突兀消失） */
  fold(hide) {
    if (this._foldTween) this._foldTween.cancel();
    if (hide === this.folded) return;
    this.folded = hide;
    const target = hide ? 0.001 : 1;
    if (!hide) this.group.visible = true;
    this._foldTween = tween({
      from: this.group.scale.x, to: target, duration: 1.1, ease: easeInOutCubic,
      onUpdate: (v) => this.group.scale.setScalar(Math.max(v, 0.001)),
      onComplete: () => { if (hide) this.group.visible = false; }
    });
  }

  update(t, dt) {
    if (!this.group.visible) return;
    // 五角星：缓慢自转 + 光强呼吸
    this.star.rotation.y += dt * 0.8;
    const pulse = 0.8 + 0.2 * Math.sin(t * 2.1);
    this.starLight.intensity = 22 * pulse;
    this.star.material.emissiveIntensity = 1.6 * pulse;
    this.starHalo.material.opacity = 0.55 + 0.2 * Math.sin(t * 2.1);
    this.starRing.rotation.z += dt * 0.6;
    this.starRing.rotation.x = Math.sin(t * 0.7) * 0.5;

    // 同心圆底座：交替旋转 + 呼吸
    this.rings.forEach((r, i) => {
      r.rotation.z += dt * (i % 2 === 0 ? 0.12 : -0.12);
      r.material.opacity = 0.36 + 0.18 * Math.sin(t * 1.4 + i * 2.1);
    });

    // 彩灯模式
    const mode = LIGHT_MODES[this.lightMode];
    this.lightMats.forEach((m, gi) => {
      if (mode === 'warm') {
        this._tmpColor.setHex(m.userData.baseColor || (m.userData.baseColor = m.color.getHex()));
        m.color.copy(this._tmpColor);
        m.opacity = 0.55 + 0.28 * Math.sin(t * 2.2 + gi * 1.1);
      } else if (mode === 'aurora') {
        // 星樱幻彩：粉→紫→金的柔和循环
        m.color.setHSL(0.88 + 0.1 * Math.sin(t * 0.12 + gi / 1.5), 0.7, 0.68);
        m.opacity = 0.6 + 0.3 * Math.sin(t * 3.0 + gi * 2.0);
      } else {
        m.color.setHex(0xf3e8ff);
        m.opacity = 0.4 + 0.32 * Math.sin(t * 1.2 + gi * 1.6);
      }
    });

    // 灯带流光
    this.ribbonMat.uniforms.uTime.value = t;
  }

  onResize(pixelRatio, viewportHeight) {
    this.ribbonMat.uniforms.uPixelRatio.value = pixelRatio;
    const fovRad = 45 * Math.PI / 180;
    this.ribbonMat.uniforms.uScale.value = viewportHeight / (2 * Math.tan(fovRad / 2));
  }
}
