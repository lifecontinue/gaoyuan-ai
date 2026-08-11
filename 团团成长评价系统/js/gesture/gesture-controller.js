// 手势控制：调用摄像头 + MediaPipe Hands 识别，将手势映射为星图交互。
// 参考实现：https://city.xiaoercamera.xyz/（同样用 @mediapipe/hands）
// 模型优先从本服务自托管路径 <基址>/mediapipe/ 加载（离线/云端/子路径均可），失败时回落 CDN。
import { basePath } from '../core/config.js';
const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/';

/** 自托管模型基址：按当前页面路径推断（支持子路径部署，如 https://host/tuantuan/mediapipe/） */
function mpLocal() { return basePath() + '/mediapipe/'; }

/* MediaPipe Hands 21 个关键点的骨架连接（用于在 canvas 上绘制） */
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],           // 食指
  [5, 9], [9, 10], [10, 11], [11, 12],      // 中指
  [9, 13], [13, 14], [14, 15], [15, 16],    // 无名指
  [13, 17], [17, 18], [18, 19], [19, 20],   // 小指
  [0, 17]                                    // 手掌下沿
];

const GestureController = {
  enabled: false,
  _video: null,
  _canvas: null,
  _canvasCtx: null,
  /** MediaPipe 输入用的离屏 Canvas（避免 video 元素直接传入导致的兼容性问题） */
  _inputCanvas: null,
  _inputCtx: null,
  _stream: null,
  _hands: null,
  _raf: 0,
  _sending: false,
  _prev: { x: null, pinch: null },
  _statusEl: null,
  _indicatorEl: null,
  _debugEl: null,
  _mpBase: '',
  _mirror: false,
  /* ---------- 调试与统计 ---------- */
  _frameCount: 0,
  _lastFpsT: 0,
  _fps: 0,
  _sendCount: 0,          // send() 调用次数
  _resultCount: 0,        // onResults 回调次数
  _detectCount: 0,        // 检测到手的次数
  _lastSendSuccessT: 0,   // 最后一次 send 成功完成的时间
  _inferAvgMs: 0,         // 平均推理耗时
  _camW: 0, _camH: 0,     // 摄像头实际分辨率
  _targetInterval: 33,    // 手势识别目标 FPS：30
  _lastSendT: 0,
  _smooth: { pinch: null, cx: null },
  /* 识别灵敏度配置（可在控制台临时调整） */
  config: {
    minDetectionConfidence: 0.30,  // ← 0.40 太高；弱光/距离远时识别不到
    minTrackingConfidence: 0.30,   // ← 同上，降低抖动丢失率
    modelComplexity: 0,            // ← 0=精简模型，更快；1=完整，更准但慢
    pinchThreshold: 0.40,
    rotationGain: 3.6,
    zoomGain: 2.6,
    showLandmarks: true,
  },

  init() {
    this.layer = document.getElementById('gestureLayer');
    this.statusEl = document.getElementById('gestureStatus');
    this.video = document.getElementById('gestureVideo');
    this._video = this.video; // 修复：_loop 发送闸门与 drawImage 用的是 this._video，必须在此赋值，否则 canSend 恒为 false
    this.canvas = document.getElementById('gestureCanvas');
    this.indicatorEl = document.getElementById('glIndicator');
    this.debugEl = document.getElementById('glDebug');
    if (this.canvas && this.canvas.getContext) {
      this._canvasCtx = this.canvas.getContext('2d');
    }
    // 预创建输入用离屏 Canvas（尺寸会在 _resizeCanvas 中同步）
    this._inputCanvas = document.createElement('canvas');
    this._inputCtx = this._inputCanvas.getContext('2d');
  },

  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      (window.isSecureContext || location.protocol === 'http:' && location.hostname === 'localhost'));
  },

  async toggle() {
    if (this.enabled) this.disable();
    else await this.enable();
  },

  async enable() {
    if (this.enabled) return;
    if (!this.isSupported()) {
      this._setStatus('当前环境不支持摄像头（需 https 或 localhost）', 'error');
      return;
    }
    this._showLayer();
    this._setIndicator('idle');
    this._setStatus('正在启动摄像头…', 'init');
    /* ---------- 1) 请求摄像头（ideal 约束，允许驱动选择最近分辨率，不要精确 exact） ---------- */
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 640, min: 320, max: 1280 },
          height: { ideal: 480, min: 240, max: 720 },
          frameRate: { ideal: 30, min: 15 }
        },
        audio: false,
      });
    } catch (e) {
      this._setStatus('摄像头被拒绝或不可用：' + (e && e.message ? e.message : e), 'error');
      this._hideLayer();
      return;
    }
    // 读取摄像头实际参数（驱动可能返回和请求不同的分辨率）
    const track = this._stream.getVideoTracks && this._stream.getVideoTracks()[0];
    if (track) {
      const settings = (typeof track.getSettings === 'function') ? track.getSettings() : {};
      this._camW = settings.width || 0;
      this._camH = settings.height || 0;
      console.log('[Gesture] 摄像头实际参数:', settings);
    }
    this.video.srcObject = this._stream;

    /* ---------- 2) 等待首帧解码完成（loadedmetadata + 500ms 兜底） ---------- */
    await new Promise((resolve) => {
      const done = () => { resolve(); };
      if (this.video.videoWidth && this.video.videoHeight) {
        done();
      } else {
        this.video.addEventListener('loadedmetadata', done, { once: true });
        setTimeout(done, 500);
      }
    });
    try { await this.video.play(); } catch (e) {}
    this._resizeCanvas();
    this.video.addEventListener('resize', () => this._resizeCanvas());

    /* ---------- 3) 加载 MediaPipe 模型 ---------- */
    this._setStatus('正在加载手势模型…', 'init');
    this._sendCount = 0; this._resultCount = 0; this._detectCount = 0;
    this._inferAvgMs = 0; this._lastSendSuccessT = 0;
    try {
      await this._ensureHands();
    } catch (e) {
      console.error('[Gesture] MediaPipe 加载失败：', e);
      this._setStatus((e && e.message) ? e.message : '手势模型加载失败', 'error');
      this.disable();
      return;
    }

    this.enabled = true;
    this._prev = { x: null, pinch: null };
    this._smooth = { pinch: null, cx: null };
    this._frameCount = 0;
    this._lastFpsT = performance.now();
    this._lastSendT = 0;
    this._setIndicator('idle');
    this._setStatus('请将手掌对准摄像头（距离约 0.5–1 米）', 'ready');
    this._loop();
  },

  disable() {
    this.enabled = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._stream) {
      this._stream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
        try { t.enabled = false; } catch (e) {}
      });
      this._stream = null;
    }
    if (this.video) {
      try { this.video.pause(); } catch (e) {}
      try { this.video.srcObject = null; } catch (e) {}
    }
    if (this._hands) {
      try {
        if (typeof this._hands.close === 'function') this._hands.close();
      } catch (e) { console.warn('[Gesture] hands.close failed:', e); }
      this._hands = null;
    }
    document.querySelectorAll('script[data-mediapipe-gesture]').forEach(s => s.remove());
    this._prev = { x: null, pinch: null };
    this._smooth = { pinch: null, cx: null };
    this._sending = false;
    this._lastSendT = 0;
    if (this._canvasCtx && this.canvas) {
      this._canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this._hideLayer();
  },

  /* ---------- 内部 ---------- */

  _showLayer() { if (this.layer) this.layer.hidden = false; },
  _hideLayer() { if (this.layer) this.layer.hidden = true; },
  _setStatus(t, state) {
    if (this.statusEl) this.statusEl.textContent = t;
    if (state && this.indicatorEl) {
      this.indicatorEl.className = 'gl-indicator ' + (state === 'active' ? 'active' : state === 'error' ? 'error' : '');
    }
  },
  _setIndicator(state) {
    if (!this.indicatorEl) return;
    this.indicatorEl.className = 'gl-indicator ' + (state === 'active' ? 'active' : state === 'error' ? 'error' : '');
  },
  _resizeCanvas() {
    if (!this.canvas || !this.video) return;
    const vw = this.video.videoWidth || 640;
    const vh = this.video.videoHeight || 480;
    if (!this._camW) { this._camW = vw; this._camH = vh; }
    if (this.canvas.width !== vw) this.canvas.width = vw;
    if (this.canvas.height !== vh) this.canvas.height = vh;
    // 同步离屏输入 Canvas
    if (this._inputCanvas && (this._inputCanvas.width !== vw || this._inputCanvas.height !== vh)) {
      this._inputCanvas.width = vw;
      this._inputCanvas.height = vh;
    }
  },

  _loadScript() {
    return new Promise((resolve, reject) => {
      if (window.Hands) { this._mpBase = this._mpBase || mpLocal(); return resolve(); }
      const tryLoad = (base) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.setAttribute('data-mediapipe-gesture', '1');
        s.src = base + 'hands.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => res(base);
        s.onerror = () => rej(new Error(base));
        document.head.appendChild(s);
      });
      tryLoad(mpLocal())
        .then((base) => { this._mpBase = base; resolve(); })
        .catch(() => tryLoad(MP_CDN)
          .then((base) => { this._mpBase = base; resolve(); })
          .catch(() => reject(new Error('手势模型加载失败（请确认自托管 /mediapipe/ 资源，或联网访问 CDN）'))));
    });
  },

  async _ensureHands() {
    await this._loadScript();
    if (this._hands) return;
    const Hands = window.Hands;
    if (!Hands) throw new Error('window.Hands 未定义，hands.js 加载异常');
    const base = this._mpBase || mpLocal();
    const hands = new Hands({ locateFile: (f) => base + f });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: this.config.modelComplexity,
      minDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
    });
    hands.onResults((r) => this._onResults(r));
    this._hands = hands;
    console.log('[Gesture] Hands 实例化完成, base=', base, 'complexity=', this.config.modelComplexity);
  },

  _loop() {
    if (!this.enabled) return;
    const now = performance.now();
    const canSend = !this._sending
      && this._hands
      && this._video
      && this._video.readyState >= 3   // ← HAVE_FUTURE_DATA，确保有新帧（原 readyState>=2 可能卡旧帧）
      && (now - this._lastSendT >= this._targetInterval);
    if (canSend) {
      this._sending = true;
      this._lastSendT = now;
      this._sendCount++;
      const sendStart = now;
      // ↓↓ 核心修复：把 video 当前帧画到离屏 Canvas 再传入 MediaPipe ↓↓
      // 直接传 video 在某些浏览器/驱动下会导致 MediaPipe 收到全黑/过时帧，完全识别不到手
      let inputImage;
      try {
        const W = this._inputCanvas.width, H = this._inputCanvas.height;
        if (W > 0 && H > 0 && this._inputCtx) {
          this._inputCtx.save();
          // 因为 CSS 对 video/canvas 做了 scaleX(-1)（用户镜像视觉），
          // 但实际上 MediaPipe 的输入数据如果镜像后，会影响左右手 handedness，
          // 关键：用户举起右手（用户视角） = 摄像头看到的左边 = lm.x 小 → 坐标计算本身没问题，
          // 但模型在训练时用的是正常镜像（左手对应左手），所以这里**不需要**水平翻转 inputCanvas。
          this._inputCtx.drawImage(this._video, 0, 0, W, H);
          inputImage = this._inputCanvas;
          this._inputCtx.restore();
        } else {
          inputImage = this.video; // 兜底
        }
      } catch (e) {
        console.warn('[Gesture] 绘制输入帧失败，回退到 video:', e);
        inputImage = this.video;
      }
      this._hands.send({ image: inputImage })
        .then(() => {
          const dt = performance.now() - sendStart;
          this._lastSendSuccessT = performance.now();
          // 推理耗时滑动平均（α=0.2）
          this._inferAvgMs = this._inferAvgMs ? (this._inferAvgMs * 0.8 + dt * 0.2) : dt;
        })
        .catch((e) => { console.warn('[Gesture] send error:', e); })
        .finally(() => { this._sending = false; });
    }
    this._raf = requestAnimationFrame(() => this._loop());
  },

  _dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  },

  _drawLandmarks(lm) {
    if (!this._canvasCtx || !this.canvas) return;
    const ctx = this._canvasCtx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!lm || !this.config.showLandmarks) return;
    const px = (x) => x * W;
    const py = (y) => y * H;
    // 画掌心参考框（方便用户知道手的位置是否在有效区）
    if (lm && lm.length >= 21) {
      const xs = lm.map(p => p.x), ys = lm.map(p => p.y);
      const x1 = Math.min(...xs), x2 = Math.max(...xs);
      const y1 = Math.min(...ys), y2 = Math.max(...ys);
      ctx.save();
      ctx.strokeStyle = 'rgba(110,168,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(px(x1) - 8, py(y1) - 8, px(x2 - x1) + 16, py(y2 - y1) + 16);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(60,200,160,0.95)';
    ctx.lineWidth = Math.max(2, W / 200);
    ctx.lineCap = 'round';
    HAND_CONNECTIONS.forEach(([a, b]) => {
      if (!lm[a] || !lm[b]) return;
      ctx.beginPath();
      ctx.moveTo(px(lm[a].x), py(lm[a].y));
      ctx.lineTo(px(lm[b].x), py(lm[b].y));
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(255,180,80,1)';
    for (let i = 0; i < lm.length; i++) {
      if (!lm[i]) continue;
      ctx.beginPath();
      ctx.arc(px(lm[i].x), py(lm[i].y), Math.max(3, W / 160), 0, Math.PI * 2);
      ctx.fill();
    }
  },

  _onResults(res) {
    this._frameCount++;
    this._resultCount++;
    const now = performance.now();
    if (now - this._lastFpsT > 1000) {
      this._fps = Math.round(this._frameCount * 1000 / (now - this._lastFpsT));
      this._frameCount = 0; this._lastFpsT = now;
    }
    const handed = res.multiHandedness && res.multiHandedness[0];
    const lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
    if (lm) this._detectCount++;
    this._drawLandmarks(lm);

    /* ---------- 调试信息（详细版，用户能直接看到识别状态） ---------- */
    if (this.debugEl) {
      const camSize = this._camW + 'x' + this._camH;
      const ratio = this._sendCount > 0 ? Math.round(this._detectCount / this._sendCount * 100) : 0;
      const infer = Math.round(this._inferAvgMs);
      const handScore = (handed && handed.score != null) ? (handed.score * 100).toFixed(0) + '%' : '--';
      const lmSize = lm ? (lm.length + 'pts') : '--';
      this.debugEl.textContent =
        `${this._fps}FPS · 摄像${camSize} · 发送${this._sendCount}/收到${this._resultCount} · 命中${ratio}% · 推理${infer}ms · 置信度${handScore} · ${lmSize}`;
    }

    if (!lm) {
      this._prev.x = null; this._prev.pinch = null;
      this._smooth.pinch = null; this._smooth.cx = null;
      // 如果 send 了很多次但一次都没命中，给出提示帮助用户
      if (this._sendCount > 30 && this._detectCount === 0) {
        this._setStatus('未检测到手 · 请调整光线/距离 0.5-1米/手掌正对镜头', 'idle');
      } else {
        this._setStatus('未检测到手 · 请将手掌伸入画面中央', 'idle');
      }
      return;
    }
    const W = 0, THUMB = 4, INDEX = 8, MIDDLE_MCP = 9;
    let cx = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
    if (this._mirror) cx = 1 - cx;
    const handSize = Math.max(1e-4, this._dist(lm[W], lm[MIDDLE_MCP]));
    const pinchRaw = this._dist(lm[THUMB], lm[INDEX]) / handSize;

    const SMOOTH_ALPHA = 0.35;
    if (this._smooth.cx == null) this._smooth.cx = cx;
    else this._smooth.cx = SMOOTH_ALPHA * cx + (1 - SMOOTH_ALPHA) * this._smooth.cx;
    if (this._smooth.pinch == null) this._smooth.pinch = pinchRaw;
    else this._smooth.pinch = SMOOTH_ALPHA * pinchRaw + (1 - SMOOTH_ALPHA) * this._smooth.pinch;
    cx = this._smooth.cx;
    const pinch = this._smooth.pinch;
    const isPinch = pinch < this.config.pinchThreshold;

    if (isPinch) {
      if (this._prev.pinch == null) {
        this._prev.pinch = pinch;
        this._setStatus('捏合缩放中…张合食指拇指控制缩放', 'active');
      } else {
        const d = pinch - this._prev.pinch;
        if (Math.abs(d) > 0.015) {
          const smoothD = Math.sign(d) * Math.min(0.08, Math.abs(d));
          if (window.Galaxy) window.Galaxy.zoomBy(1 + smoothD * this.config.zoomGain);
          this._prev.pinch = pinch;
          this._setStatus(d >= 0 ? '放大 ↑' : '缩小 ↓', 'active');
        }
      }
      this._prev.x = null;
    } else {
      if (this._prev.x == null) {
        this._prev.x = cx;
        this._setStatus('拖拽旋转中…手掌摆动旋转视角', 'active');
      } else {
        const dx = cx - this._prev.x;
        if (Math.abs(dx) > 0.008) {
          const smoothDx = Math.sign(dx) * Math.min(0.06, Math.abs(dx));
          if (window.Galaxy) window.Galaxy.orbitBy(smoothDx * this.config.rotationGain, 0);
          this._prev.x = cx;
          this._setStatus(dx > 0 ? '向右旋转 →' : '← 向左旋转', 'active');
        }
      }
      this._prev.pinch = null;
    }
  },
};

if (typeof window !== 'undefined') window.GestureController = GestureController;
export { GestureController };
