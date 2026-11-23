/* ============================================================
   snow.js — 动态雪花系统 + 深空星海背景
   - 雪花：全部运动在顶点着色器完成（零 CPU/GC 开销），
     正弦风场摇曳，触底无缝重置至顶部，可整体淡入淡出
   - 星空：远景多色温恒星随机闪烁，附粉色系深空星云光晕
   ============================================================ */
import * as THREE from 'three';

/* 程序化柔光贴图 */
function softTexture(inner = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 星云光晕贴图 */
function glowTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, `rgba(${rgb},0.45)`);
  grd.addColorStop(0.5, `rgba(${rgb},0.12)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const SNOW_AREA = 36;      // 水平分布范围：x/z ∈ [-18, 18] 视锥内
const SNOW_H = 20.5;       // 下落柱高：y ∈ [-2.5, 18]，落出底部后从顶部重生
const SNOW_BOTTOM = -2.5;

export class Snow {
  constructor(scene, count) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const pos = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    const drift = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * SNOW_AREA;
      pos[i * 3 + 1] = Math.random() * SNOW_H;          // 初始高度随机铺满
      pos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_AREA;
      speed[i] = 1.0 + Math.random() * 2.0;             // 不同终端速度
      phase[i] = Math.random();
      size[i] = 0.08 + Math.random() * 0.18;            // 世界单位 0.08~0.26
      drift[i] = 0.5 + Math.random() * 1.1;             // 摇曳幅度
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aDrift', new THREE.BufferAttribute(drift, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uHeight: { value: SNOW_H },
        uBottom: { value: SNOW_BOTTOM },
        uScale: { value: 1000 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: softTexture() }
      },
      vertexShader: /* glsl */`
        attribute float aSpeed;
        attribute float aPhase;
        attribute float aSize;
        attribute float aDrift;
        uniform float uTime;
        uniform float uHeight;
        uniform float uBottom;
        uniform float uScale;
        uniform float uPixelRatio;
        varying float vA;
        void main() {
          // 下落 + 触底无缝重置（mod 回绕，区间 [-2.5, 18)）
          float y = mod(position.y - uTime * aSpeed, uHeight) + uBottom;
          // 正弦风场左右摇曳
          vec3 p = vec3(
            position.x + sin(uTime * 0.7 + aPhase * 6.2832) * aDrift,
            y,
            position.z + cos(uTime * 0.5 + aPhase * 5.0) * aDrift * 0.6
          );
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = 0.4 + 0.35 * sin(aPhase * 40.0 + uTime);
          gl_PointSize = aSize * uScale * uPixelRatio / -mv.z;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform float uAlpha;
        varying float vA;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          // 带一丝粉调的雪
          gl_FragColor = vec4(vec3(0.97, 0.92, 0.97), tex.a * vA * uAlpha * 0.75);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this._alphaRaf = 0;
  }

  /** 飘雪开关（平滑淡入淡出） */
  setEnabled(on) {
    cancelAnimationFrame(this._alphaRaf);
    const target = on ? 1 : 0;
    const from = this.material.uniforms.uAlpha.value;
    const start = performance.now(), dur = 800;
    const step = (now) => {
      const k = Math.min((now - start) / dur, 1);
      const v = from + (target - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      this.material.uniforms.uAlpha.value = v;
      this.group.visible = v > 0.01;
      if (k < 1) this._alphaRaf = requestAnimationFrame(step);
    };
    this._alphaRaf = requestAnimationFrame(step);
  }

  update(t) {
    this.material.uniforms.uTime.value = t;
  }

  onResize(pixelRatio, viewportHeight) {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    const fovRad = 45 * Math.PI / 180;
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(fovRad / 2));
  }
}

/* ---------- 深空星海 ---------- */
export class Starfield {
  constructor(scene, count) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);
    // 多色温恒星：粉白 / 淡紫 / 香槟金 / 月白
    const palette = [
      [1.0, 0.9, 0.95], [0.88, 0.78, 1.0], [1.0, 0.87, 0.72], [0.95, 0.92, 1.0]
    ];
    for (let i = 0; i < count; i++) {
      const r = 45 + Math.random() * 45;     // 远景深空球壳 45~90
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      seed[i] = Math.random();
      size[i] = (1.1 + Math.random() * 1.9) * (Math.random() < 0.06 ? 2.2 : 1.0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: softTexture() }
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vTw;
        varying vec3 vColor;
        void main() {
          // 随机闪烁
          vTw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 90.0), 2.0);
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying float vTw;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, tex.a * vTw * 0.85);
        }
      `,
      vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    this.group.add(new THREE.Points(geo, this.material));

    // 深空星云光晕（粉 / 紫 / 暗金）
    const nebulas = [
      { rgb: '190, 70, 130', x: 0, y: 30, z: -110, s: 170, o: 0.2 },
      { rgb: '120, 60, 170', x: -80, y: -10, z: -100, s: 150, o: 0.18 },
      { rgb: '210, 130, 90', x: 85, y: 20, z: -105, s: 120, o: 0.12 }
    ];
    for (const n of nebulas) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(n.rgb), transparent: true, opacity: n.o,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      sp.position.set(n.x, n.y, n.z);
      sp.scale.setScalar(n.s);
      this.group.add(sp);
    }
  }

  update(t, dt) {
    this.group.rotation.y += dt * 0.003;  // 随视角微弱视差
    this.material.uniforms.uTime.value = t;
  }

  onResize(pixelRatio) {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}
