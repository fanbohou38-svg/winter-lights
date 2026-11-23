/* ============================================================
   controls.js — OrbitControls 封装 + 底部控制栏 UI 事件绑定
   - 阻尼惯性、缩放/俯仰限制、自动巡航（交互暂停、松手 2 秒后恢复）
   - 支持电脑拖拽/滚轮与手机单指旋转、双指缩放
   - 重置视角：相机与目标点平滑缓动复位（零 GC：预分配临时向量）
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { tween, easeInOutCubic } from './particles.js';

const LIGHT_LABELS = ['💡 彩灯 · 玫瑰金', '💡 彩灯 · 星樱', '💡 彩灯 · 月白'];

export class ControlsUI {
  constructor(camera, dom) {
    this.camera = camera;
    this.orbit = new OrbitControls(camera, dom);
    const o = this.orbit;
    o.enableDamping = true;
    o.dampingFactor = 0.05;
    o.minDistance = 8;
    o.maxDistance = 42;
    o.minPolarAngle = 0.2;
    o.maxPolarAngle = Math.PI * 0.54;   // 防止钻入地面以下
    o.target.set(0, 3.8, 0);            // 看向树身中部，完整呈现整棵树
    o.autoRotate = true;
    o.autoRotateSpeed = 0.6;

    // 用户交互时暂停自动巡航，松手 2 秒后恢复
    this._resumeTimer = null;
    o.addEventListener('start', () => {
      o.autoRotate = false;
      clearTimeout(this._resumeTimer);
    });
    o.addEventListener('end', () => {
      clearTimeout(this._resumeTimer);
      this._resumeTimer = setTimeout(() => { o.autoRotate = true; }, 2000);
    });

    // 记录初始机位
    this.homePos = camera.position.clone();
    this.homeTarget = o.target.clone();
    this._resetTween = null;
    // 预分配临时向量（动画循环/补间外不创建新对象）
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  /** 相机平滑缓动复位 */
  resetView() {
    if (this._resetTween) this._resetTween.cancel();
    this.orbit.autoRotate = false;
    const p0 = this._v1.copy(this.camera.position);
    const t0 = this._v2.copy(this.orbit.target);
    const p1 = this.homePos, t1 = this.homeTarget;
    this._resetTween = tween({
      from: 0, to: 1, duration: 1.6, ease: easeInOutCubic,
      onUpdate: (v) => {
        this.camera.position.lerpVectors(p0, p1, v);
        this.orbit.target.lerpVectors(t0, t1, v);
        this.orbit.update();
      },
      onComplete: () => {
        this._resumeTimer = setTimeout(() => { this.orbit.autoRotate = true; }, 2000);
      }
    });
  }

  /** 绑定底部控制栏按钮 */
  bindUI({ onToggleBloom, onPhotoUpload, onMusicUpload, onLights, onSnow, onMusic, onVolume }) {
    const $ = (id) => document.getElementById(id);
    const btnToggle = $('btn-toggle');
    const btnPhoto = $('btn-photo');
    const btnLights = $('btn-lights');
    const btnSnow = $('btn-snow');
    const btnMusic = $('btn-music');
    const btnMusicFile = $('btn-music-file');
    const musicWrap = $('music-wrap');
    const volume = $('volume');
    let lightIdx = 0;

    btnToggle.addEventListener('click', () => {
      const bloomed = btnToggle.classList.toggle('on');
      btnToggle.textContent = bloomed ? '🎄 聚合圣诞树' : '✨ 粒子绽放';
      onToggleBloom(bloomed);
    });

    // 上传照片：触发隐藏的 file input（multiple，浏览器本地处理）
    btnPhoto.addEventListener('click', () => onPhotoUpload());

    btnLights.addEventListener('click', () => {
      lightIdx = (lightIdx + 1) % 3;
      btnLights.textContent = LIGHT_LABELS[lightIdx];
      onLights(lightIdx);
    });

    btnSnow.addEventListener('click', () => {
      const on = btnSnow.classList.toggle('on');
      btnSnow.textContent = on ? '❄️ 飘雪 · 开' : '❄️ 飘雪 · 关';
      onSnow(on);
    });

    btnMusic.addEventListener('click', () => {
      const on = btnMusic.classList.toggle('on');
      btnMusic.textContent = on ? '♪ 音乐 · 开' : '♪ 音乐 · 关';
      onMusic(on);
    });

    // 上传音乐：触发隐藏的 file input（本地播放，不上传服务器）
    btnMusicFile.addEventListener('click', () => onMusicUpload());

    // 音量滑块：桌面 hover 展开，触屏点击「音乐」区域展开（CSS 协同）
    musicWrap.addEventListener('click', (e) => {
      if (e.target === volume) return;
      musicWrap.classList.add('expanded');
    });
    document.addEventListener('click', (e) => {
      if (!musicWrap.contains(e.target)) musicWrap.classList.remove('expanded');
    });
    volume.addEventListener('input', () => onVolume(volume.value / 100));
  }
}
