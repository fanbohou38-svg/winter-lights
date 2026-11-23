/* ============================================================
   particles.js — 3D 粒子圣诞树 + 绽放/聚合状态机（防过爆版）
   - BufferGeometry 维护两套坐标：treePositions（树）/ nebulaPositions（星云）
   - 顶点着色器按 uProgress 插值，含相位差呼吸闪烁与布朗漂浮
   - 粒子使用世界单位尺寸（0.12~0.22）+ sizeAttenuation，细腻不糊屏
   - 状态切换随时可打断反向，无跳变
   ============================================================ */
import * as THREE from 'three';

/* ---------- 迷你缓动引擎（项目内通用，避免引入额外依赖） ---------- */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 轻量补间：tween({ from, to, duration, ease, onUpdate, onComplete })
 * 返回 { cancel() }，重复调用同一目标的 tween 时先 cancel 即可打断。
 */
export function tween({ from = 0, to = 1, duration = 1, ease = easeInOutCubic, onUpdate, onComplete }) {
  let raf = 0, cancelled = false;
  const start = performance.now();
  function step(now) {
    if (cancelled) return;
    const k = Math.min((now - start) / (duration * 1000), 1);
    const v = from + (to - from) * ease(k);
    onUpdate && onUpdate(v, k);
    if (k < 1) raf = requestAnimationFrame(step);
    else onComplete && onComplete();
  }
  raf = requestAnimationFrame(step);
  return { cancel() { cancelled = true; cancelAnimationFrame(raf); } };
}

/* 程序化发光贴图：中心锐利、外缘全透的陡峭衰减径向渐变圆点
   （防止 AdditiveBlending 下大量粒子重叠熔接成光柱） */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  grd.addColorStop(0.12, 'rgba(255,255,255,1.0)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.32)');
  grd.addColorStop(0.65, 'rgba(255,255,255,0.05)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 树体几何参数（christmas-tree.js / photos.js 中的装饰物使用同一坐标系）
   树高约 10 个单位，底部半径约 4.2 —— 与相机 (0,4,24) 的构图匹配 */
export const TREE_H = 10;
export const TREE_R = 4.2;
export const TREE_BASE_Y = 1.0;

export class ParticleTree {
  /**
   * @param {THREE.Scene} scene
   * @param {number} count 粒子数量（桌面 14000 / 移动端 6500）
   */
  constructor(scene, count) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.count = count;
    this.progress = 0;           // 0 = 圣诞树聚合态, 1 = 星云绽放态
    this.state = 'tree';         // 'tree' | 'nebula'
    this._activeTween = null;

    const treePos = new Float32Array(count * 3);
    const nebula = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const size = new Float32Array(count);

    /* 粉色系配色：玫瑰粉渐变 + 香槟金 / 淡紫 / 月白点缀（58% / 20% / 12% / 10%） */
    const cDeep = new THREE.Color('#e75496');   // 玫瑰粉（树底深色）
    const cLight = new THREE.Color('#ffd1e8');  // 浅樱粉（树顶浅色）
    const cGold = new THREE.Color('#fbd9a0');   // 香槟金点缀
    const cGold2 = new THREE.Color('#f7c873');
    const cLilac = new THREE.Color('#d8b4fe');  // 淡紫点缀
    const cIce = new THREE.Color('#fff5fa');    // 月白点缀
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      /* ---- 树形态：幂分布偏向底部的圆锥螺旋 + 7.5π 松枝层叠波浪 ---- */
      const h = 1 - Math.sqrt(Math.random());     // 归一化高度：下盘厚重
      const y = h * TREE_H + TREE_BASE_Y;
      const rr = TREE_R * Math.pow(1 - h, 0.92)
        * (0.82 + 0.18 * Math.abs(Math.sin(h * 7.5 * Math.PI)))   // 7~8 层松枝裙摆
        + (Math.random() - 0.5) * 0.3;
      const ang = h * 16 * Math.PI + Math.random() * 0.55;        // 盘旋上升
      treePos[i * 3] = Math.cos(ang) * rr;
      treePos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.3;
      treePos[i * 3 + 2] = Math.sin(ang) * rr;

      /* ---- 星云形态：球面均匀采样 + 伪 Simplex 噪声半径（7.5~26） ---- */
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(ph) * Math.cos(th);
      const dy = Math.sin(ph) * Math.sin(th);
      const dz = Math.cos(ph);
      // 多频正弦叠加近似噪声，让星云有疏密团块感
      const n = 0.55
        + 0.25 * Math.sin(dx * 4.1 + dy * 5.3)
        + 0.15 * Math.sin(dz * 6.7 - dy * 3.1)
        + 0.1 * Math.sin((dx + dz) * 9.4);
      const rb = 7.5 + 18.5 * Math.max(0.15, n);
      nebula[i * 3] = dx * rb;
      nebula[i * 3 + 1] = dy * rb * 0.72 + 4;
      nebula[i * 3 + 2] = dz * rb;

      /* ---- 颜色：玫瑰粉渐变为主体，穿插香槟金/淡紫/月白 ---- */
      const roll = Math.random();
      if (roll < 0.2) tmp.copy(cGold2).lerp(cGold, Math.random());
      else if (roll < 0.32) tmp.copy(cLilac);
      else if (roll < 0.42) tmp.copy(cIce);
      else tmp.copy(cDeep).lerp(cLight, h * 0.85 + Math.random() * 0.15);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;

      rand[i] = Math.random();
      size[i] = 0.15 + Math.random() * 0.05;   // 世界单位：0.15 ~ 0.20，细腻
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(treePos, 3));   // 树形态
    geo.setAttribute('aNebula', new THREE.BufferAttribute(nebula, 3));     // 星云形态
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uScale: { value: 1000 },    // 世界单位 → 像素换算（随视口高度更新）
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: glowTexture() }
      },
      vertexShader: /* glsl */`
        attribute vec3 aNebula;
        attribute vec3 aColor;
        attribute float aRand;
        attribute float aSize;
        uniform float uTime;
        uniform float uProgress;
        uniform float uScale;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vA;
        void main() {
          // 每颗粒子带随机相位差的平滑缓动（可打断，因 uProgress 全局连续）
          float p = clamp((uProgress - aRand * 0.25) / 0.75, 0.0, 1.0);
          p = p * p * (3.0 - 2.0 * p);
          vec3 pos = mix(position, aNebula, p);

          // 绽放态：星系公转（绕 Y 缓慢旋转，幅度随 p 增长）
          float ang = uTime * 0.07 * p;
          float ca = cos(ang), sa = sin(ang);
          pos = vec3(ca * pos.x - sa * pos.z, pos.y, sa * pos.x + ca * pos.z);

          // 过渡期：螺旋向心轨迹（sin(pπ) 保证两端点处偏移为零，无跳变）
          float swirl = sin(p * 3.14159) * (0.6 + aRand * 1.8);
          vec3 tang = vec3(-pos.z, 0.0, pos.x);
          float tl = max(length(tang), 0.001);
          pos += (tang / tl) * swirl * 1.6;

          // 微幅布朗漂浮
          pos.x += sin(uTime * (0.6 + aRand) + aRand * 50.0) * 0.05;
          pos.y += cos(uTime * (0.5 + aRand * 0.8) + aRand * 70.0) * 0.05;
          pos.z += sin(uTime * 0.4 + aRand * 90.0) * 0.04;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;

          // 相位差呼吸闪烁 + 每粒子独立亮度（0.65~0.9 区间，防止集体触发 Bloom）
          float tw = 0.5 + 0.32 * sin(uTime * (1.6 + aRand * 2.6) + aRand * 100.0);
          vColor = aColor;
          vA = tw * (0.65 + 0.25 * aRand) * (1.0 - p * 0.2);
          // 世界单位尺寸 + 距离衰减（sizeAttenuation）
          gl_PointSize = aSize * uScale * uPixelRatio / -mv.z;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vA;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * (0.75 + tex.a * 0.45), tex.a * vA * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; // 星云态范围大，关闭剔除防止消失
    this.group.add(this.points);
  }

  /** 绽放：粒子散作星云 */
  bloom() {
    this.state = 'nebula';
    this._go(1);
  }

  /** 聚合：粒子螺旋归位组成圣诞树 */
  assemble() {
    this.state = 'tree';
    this._go(0);
  }

  /** 可打断的双向切换：从当前 progress 平滑走向目标 */
  _go(target) {
    if (this._activeTween) this._activeTween.cancel();
    this._activeTween = tween({
      from: this.progress, to: target, duration: 2.6,
      onUpdate: (v) => { this.progress = v; this.material.uniforms.uProgress.value = v; }
    });
  }

  update(t) {
    this.material.uniforms.uTime.value = t;
  }

  /** 视口变化时更新像素换算（等价于 PointsMaterial 的 sizeAttenuation） */
  onResize(pixelRatio, viewportHeight) {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    const fovRad = 45 * Math.PI / 180;   // 与 main.js 相机 fov 保持一致
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(fovRad / 2));
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.material.uniforms.uMap.value.dispose();
  }
}
