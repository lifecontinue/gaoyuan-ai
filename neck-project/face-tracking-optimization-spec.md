# 人脸识别功能优化需求（交付给开发助手）

> 作用范围：`neck-project/neck-soccer.html`（单文件前端游戏）
> 核心依赖：MediaPipe FaceMesh + `@mediapipe/camera_utils`
> 前置约束：**保留现有游戏核心循环、物理碰撞、HUD、Demo 回退机制**，本次只优化人脸识别链路，不重写玩法。

---

## 0. 背景与现状（开发前必读）

当前实现要点（见 `neck-soccer.html`）：

- 摄像头通过 `navigator.mediaDevices.getUserMedia` 申请，分辨率固定 `640×480`。
- FaceMesh 配置：`maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5`。
- 首帧检测到脸时直接把当前位置记为 `neutralX/neutralY`，之后用 `HEAD_TRACK_GAIN_X=2.35 / HEAD_TRACK_GAIN_Y=2.6` 做相对位移映射。
- 头部半径由双耳距离 × 1.18 估算，clamp 到 `[52, 140]` px。
- `Camera.onFrame` 每帧 `await faceMesh.send({image: vid})`，无节流、无预测、无平滑。
- `startCamera()` 在失败时会递归重试一次（`return startCamera(false)`），`boot()` 与 `Play Again` 都会调用 `startCamera()`。

已知问题集中体现在三处：精度、响应、授权流程。

---

## 1. 问题一：人脸识别精度不足

### 1.1 现象
- 用户离摄像头过近或过远时，头部半径估算失真，碰撞体大小与真人头部不匹配。
- 首帧直接记为 neutral，若用户此时位置偏（如刚坐下、脸不在画面中央），后续映射整体偏移。
- 检测置信度门槛偏低（0.5），光线变化或侧脸时容易产生抖动 landmark。

### 1.2 修复目标
在正式进入游戏前，增加一个**校准环节（Calibration Step）**，确保人脸在画面中的大小与位置处于合理范围后才开始追踪。

### 1.3 详细需求

#### 1.3.1 校准环节交互（强前端引导）

校准是一个**独立的、占满全屏的引导层**，不是游戏画面上的一行提示文字。用户必须能一眼看懂"我要做什么、现在做对没有"。

##### A. 校准层布局（DOM 结构）

```
#calibLayer（全屏遮罩，z-index:9，半透明深色 backdrop-filter:blur(8px)）
├── #calibTitle        顶部居中，主标题 "Position your face"
├── #calibSub          紧贴主标题下，副提示 "Move closer or farther until the ring fills"
├── #calibStage        中央主区域（flex 居中）
│   ├── #guideFrame    目标框（椭圆/圆角矩形，固定尺寸，见 B）
│   ├── #liveHead      实时人脸轮廓叠加（canvas 绘制，见 C）
│   └── #distanceRing  环形进度条（包裹目标框外侧，见 D）
├── #calibStatus       目标框下方，当前状态文字（见 E 状态机）
└── #calibActions      底部，始终显示 "Use Demo" 按钮；超时后显示 "Retry"
```

##### B. 目标框视觉规格

- 形状：圆角矩形（圆角半径 24px），模拟人脸比例，宽:高 = 3:4。
- 尺寸：宽度 = `min(viewportW, viewportH) * 0.32`，高度按 3:4 比例。
- 默认态：`border: 3px dashed rgba(255,255,255,.35)`，背景 `rgba(255,255,255,.03)`。
- 聚焦态（人脸进入合理范围）：`border: 3px solid var(--accent2)`（青色），`box-shadow: 0 0 24px rgba(58,214,192,.45)`。
- 锁定态：`border: 3px solid var(--perfect)`（绿色），内部填充 `rgba(142,247,169,.12)`，0.4s 淡入。
- 框内始终居中显示一个浅色人脸轮廓 SVG（半透明 18%），作为"对齐参考"。

##### C. 实时人脸轮廓叠加（关键引导）

校准期间不能只给一个空框，必须把**当前检测到的人脸实时画出来**，让用户看到"我的人脸现在多大、偏哪边"。

- 在 `#liveHead`（canvas）上每帧绘制：
  - 检测到的人脸外接椭圆（基于 earL/earR/chin/brow 算出的中心和半径）。
  - 颜色随状态变化：太近 `#ff5a3c`、太远 `#ff9a3c`、偏移 `#ffd23f`、合格 `#3ad6c0`。
  - 椭圆边缘加 4 个小刻度点（上/下/左/右），强化"对齐"感。
- 没检测到脸时：`#liveHead` 显示一行灰字 "No face detected"，目标框恢复默认态。

##### D. 环形距离进度条

- 围绕目标框外侧的环形 SVG 进度条，表示"距离合格度"。
- 计算方式：`progress = 1 - |earDist - targetMid| / targetHalfRange`，clamp 到 [0,1]。
  - `targetMid = 0.31`（[0.22, 0.40] 中点），`targetHalfRange = 0.09`。
- 进度条颜色：`<50%` 灰、`50-80%` 黄、`>80%` 青色。
- 进度条满（≥95%）且居中达标时，触发 Hold 计时。

##### E. 校准状态机（驱动 #calibStatus 文字与颜色）

| 状态 | 进入条件 | #calibStatus 文字 | 颜色 |
|---|---|---|---|
| `searching` | 校准层刚显示 / 丢脸 | "Looking for your face…" | 灰 `#8a93a6` |
| `too-close` | earDist > 0.40 | "Too close — move back" | 红 `#ff5a3c` |
| `too-far` | earDist < 0.22 | "Too far — move closer" | 橙 `#ff9a3c` |
| `off-center` | 大小合格但 cx/cy 越界 | "Center your face in the frame" | 黄 `#ffd23f` |
| `holding` | 大小+居中均合格 | "Hold still…" + 剩余帧数 `Hold 0.4s (3/8)` | 青 `#3ad6c0` |
| `locked` | 连续 8 帧合格 | "Locked" | 绿 `#8ef7a9` |

- `holding` 态下若任意一帧失格，立即回退到对应状态，Hold 计数清零。
- `locked` 态持续 0.6s（让用户看到成功反馈）后自动 `startGame()`。

##### F. 文案层级

- 主标题 `#calibTitle`：`font-size: clamp(22px, 4vw, 34px); font-weight: 800`，白色。
- 副提示 `#calibSub`：`font-size: 14px; color: var(--muted)`，紧跟主标题。
- 状态 `#calibStatus`：`font-size: 16px; font-weight: 600`，颜色随状态机。
- 三者垂直排列，主标题→副提示→目标框→状态，间距各 12px。

#### 1.3.2 校准判定条件（全部满足才算通过）
1. **人脸大小在合理范围**：双耳距离 `earDist` 归一化值落在 `[0.22, 0.40]` 区间。
2. **人脸居中**：头部中心 `cx` 落在 `[0.4, 0.6]`、`cy` 落在 `[0.35, 0.65]`。
3. **置信度达标**：连续 `N=8` 帧（约 0.5s @30fps）满足上述两个条件。
4. 校准通过后，把该时刻的位置记为 `neutralX/neutralY`，并锁定 `headRadRaw` 作为本局基准半径。

#### 1.3.3 识别参数调优
- `minDetectionConfidence`: `0.5 → 0.6`
- `minTrackingConfidence`: `0.5 → 0.6`
- 对头部中心位置做**指数平滑**（`α=0.35`），减少 landmark 抖动，但保留响应性。

### 1.4 边界条件
- 用户始终无法满足校准（如光线极差、戴大框眼镜）：**校准超时 15s 后，#calibStatus 变为 "Having trouble? Try Demo or retry"**，#calibActions 显示 `Retry` + `Use Demo` 两个按钮。
- 校准过程中用户主动点 `Use Demo`：直接进入 Demo 模式，不阻塞。
- 校准期间 `onFace` 回调只驱动校准层绘制，**不更新 `header.x/y`**，避免校准时碰撞体乱跳。
- 游戏中途人脸丢失超过 2s：暂停物理步进，显示 "Face lost — re-center"，重新检测到脸后**不重新校准**，直接续玩（避免打断节奏）。

### 1.5 预期表现
- 校准环节耗时 ≤ 5s（正常用户）。
- 进入游戏后，头部碰撞体大小与真人头部视觉尺寸误差 ≤ 15%。
- landmark 抖动肉眼不可见。

---

## 2. 问题二：响应灵敏度差

### 2.1 现象
- 头部动作到画面反馈有明显延迟感（>150ms）。
- 快速移动时碰撞体“追不上”头部，导致碰撞判定错位。
- 球被顶到的时机与用户体感不一致。

### 2.2 修复目标
将“头部动作 → 碰撞体位置更新 → 画面反馈”的端到端延迟控制在 **≤ 100ms**，并让快速移动时碰撞体跟手。

### 2.3 详细需求

#### 2.3.1 检测链路提速
- `Camera.onFrame` 中改为**非阻塞发送**：若上一帧推理未完成，跳过本帧发送，避免排队堆积。
  - 实现：用一个 `faceMeshBusy` 标志位，`onFrame` 里 `if (faceMeshBusy) return; faceMeshBusy = true; faceMesh.send(...).finally(() => faceMeshBusy = false)`。
- 若设备支持，把 `getUserMedia` 分辨率从 `640×480` 提到 `1280×720`，但保留 `facingMode:'user'`；若 720 在低端机掉帧严重，加一个运行时降级（见 2.3.3）。

#### 2.3.2 反馈链路提速
- 对 `header.x / header.y` 做**线性预测**：基于最近两帧速度，预测下一帧位置 `header.x_pred = header.x + header.vx * predictMs`，`predictMs ≈ 50ms`。
- 渲染层直接用 `x_pred` 绘制碰撞体；碰撞判定仍用真实 `x`，避免预测过头导致“幽灵碰撞”。
- `header.power` 的平滑窗口从当前隐式的逐帧改为**滑动窗口 5 帧**，让 Power 数值响应更快但不跳变。

#### 2.3.3 性能自适应
- 监测最近 30 帧的平均帧间隔 `avgDt`：
  - `avgDt < 40ms`（≥25fps）：保持 720p。
  - `avgDt ∈ [40ms, 60ms)`：降至 480p。
  - `avgDt ≥ 60ms`：降至 480p + 关闭 `refineLandmarks`（减少模型计算量）。
- 降级时在 HUD 显示 `PERF: LOW`，用户可知晓。

### 2.4 边界条件
- 预测只在 `header.has === true` 且 `header.vx/vy` 有效时启用；丢脸后立即停止预测。
- 性能降级只降不升（避免反复抖动），除非用户手动 `Retry`。
- Demo 模式（鼠标）不走预测链路，保持原逻辑。

### 2.5 预期表现
- 中端设备端到端延迟 ≤ 100ms。
- 快速左右摆头时，碰撞体无明显滞后。
- 低端设备帧率下降时自动降级，不卡死。

---

## 3. 问题三：重复调用授权

### 3.1 现象与代码定位

**已确认的两次授权来源**（基于当前 `neck-soccer.html`）：

`getUserMedia` 在代码中只有**一处定义**（`startCamera()` 内），但 `startCamera()` 被**三个入口**调用，且内部有递归重试：

| 调用点 | 代码位置 | 触发时机 |
|---|---|---|
| `boot()` | 文件末尾 `boot()` | 页面加载自动执行 |
| `btnAgain.onclick` | game over 后点 Play Again | 用户手动触发 |
| `startCamera` 内部递归 | catch 块 `return startCamera(false)` | 设备占用类错误后 700ms 自动重试 |

**第一次授权**：`boot()` → `startCamera()` → `getUserMedia()`，浏览器弹出权限请求。

**第二次授权**（根因）：上述 catch 块的 `return startCamera(false)` 在 700ms 后递归调用，内部再次走到 `getUserMedia()`。此时若第一次的权限弹窗尚未被用户处理完毕，或浏览器把 `NotReadableError` 视作需要重新申请权限，就会触发**第二次授权弹窗**。

**额外的重复风险**：`btnAgain.onclick` 在非 demo 态也会调 `startCamera()`，虽然浏览器已记住权限不会再弹窗，但如果第一次 `boot()` 因设备占用失败后 `videoStream` 被 `cleanupCamera()` 清掉，`btnAgain` 重新走完整 `getUserMedia` 流程仍可能触发部分浏览器的二次确认。

### 3.2 修复目标
**整个页面生命周期内，摄像头授权弹窗最多出现一次**；后续所有摄像头重启都复用已授权的 stream 或走受控的单一路径，禁止递归。

### 3.3 详细需求

#### 3.3.1 授权状态机（硬约束）

引入模块级 `permissionState`，四态：

| 状态 | 含义 | 对 `getUserMedia` 的约束 |
|---|---|---|
| `unknown` | 尚未尝试授权 | 允许调用，调用后立即转 `requesting` |
| `requesting` | 授权弹窗显示中 / `getUserMedia` Promise 未 settle | **禁止调用**（硬阻塞，直接 return false） |
| `granted` | 已授权 | 后续重启优先复用 stream，不走 `getUserMedia` |
| `denied` | 被拒 / SecurityError | **永不调用**，直接 Demo |

#### 3.3.2 彻底消除递归重试

**删除**当前 catch 块里的 `return startCamera(false)` 递归调用，改为线性重试队列：

```js
// 伪代码
let resumeTimer = null;
function scheduleResume(delay){
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    if (permissionState === 'granted' || permissionState === 'unknown') {
      resumeCamera();   // 内部仍检查 permissionState，不会重复 getUserMedia
    }
  }, delay);
}
```

- 设备占用类错误（`NotReadableError` / `device in use`）：`scheduleResume(800)`，最多重试 2 次（用 `resumeAttempts` 计数）。
- 权限拒绝（`NotAllowedError`）：**不调度**，直接 `permissionState = 'denied'`，切 Demo。
- `resumeCamera()` 内部第一行：`if (permissionState === 'requesting') return false;`。

#### 3.3.3 各入口的调用约束

| 入口 | permissionState 检查 | 行为 |
|---|---|---|
| `boot()` | `unknown` → 正常 `getUserMedia`；其他态 → 走对应分支 | 首次必走 |
| `btnAgain.onclick` | `granted` 且 `videoStream` 存活 → **复用 stream，只重建 Camera**；`granted` 但 stream 断 → `getUserMedia`（浏览器不弹窗）；`denied` → 直接 Demo | 不产生二次弹窗 |
| `scheduleResume` 触发的 `resumeCamera` | `requesting` → return false；`granted/unknown` → 正常走 | 受控重试 |
| `visibilitychange` 回前台 | `granted` 且 stream 断 → `resumeCamera`；其他 → 忽略 | 自动恢复 |

#### 3.3.4 复用 stream 的实现

`btnAgain` 在 `permissionState === 'granted'` 且 `videoStream` 仍存活（tracks 未 ended）时：

```js
if (permissionState === 'granted' && videoStream && videoStream.getTracks().some(t => t.readyState === 'live')) {
  // 不调 getUserMedia，直接用现有 videoStream 重建 Camera
  vid.srcObject = videoStream;
  await vid.play();
  camera = new Camera(vid, { onFrame: ..., width: 640, height: 480 });
  await camera.start();
  return true;
}
```

#### 3.3.5 权限变化监听
- 使用 `navigator.permissions.query({name:'camera'})` 监听权限变化：
  - 用户在浏览器设置里把权限从 `denied` 改回 `granted` 时，重置 `permissionState = 'unknown'`，允许下次 `btnAgain` 重试。
- 不支持 `permissions.query` 的浏览器：降级为不监听，`btnAgain` 在 `denied` 态下仍给一次"重试"机会（点击时 `permissionState = 'unknown'`，重新 `getUserMedia`）。

### 3.4 边界条件
- 浏览器不支持 `navigator.permissions.query`（如部分 Safari）：降级为不监听，仅依赖 `getUserMedia` 的成功/失败结果。
- `getUserMedia` 抛 `NotReadableError`（设备占用）：**不计入 `denied`**，仍允许 `scheduleResume` 重试，但 `resumeAttempts` 上限 2 次。
- 页面 `visibilitychange` 回到前台时：若 `permissionState === 'granted'` 但 `videoStream` 已断，自动 `resumeCamera()`。
- 用户在 `requesting` 态期间快速连点 `Play Again`：第二次调用被 `permissionState` 守卫直接 return，不产生并发 `getUserMedia`。

### 3.5 预期表现
- 首次进入页面：**最多 1 次**授权弹窗。
- 授权弹窗显示期间，页面不会发起第二次 `getUserMedia`。
- 设备占用自动重试：不产生第二次授权弹窗（走 `scheduleResume` 线性路径）。
- 游戏结束后 `Play Again`：无授权弹窗，优先复用 stream。
- 用户拒绝授权后：`btnAgain` 不再触发 `getUserMedia`，直接 Demo；除非用户在浏览器设置里改回权限。
- `requesting` 态下任何入口的并发调用：被守卫拦截，不叠加弹窗。

---

## 4. 验收清单（开发助手完成后自检）

### 4.1 精度与校准引导
- [ ] 校准层 `#calibLayer` 全屏显示，包含 title / sub / stage / status / actions 五个区域。
- [ ] 目标框按 3:4 比例、宽度 `min(vw,vh)*0.32`，三态视觉（默认/聚焦/锁定）正确切换。
- [ ] `#liveHead` 实时绘制检测到的人脸椭圆，颜色随距离状态变化。
- [ ] 环形距离进度条 `#distanceRing` 实时反映 earDist 合格度，三档颜色切换。
- [ ] 校准状态机 6 态（searching/too-close/too-far/off-center/holding/locked）文字与颜色正确。
- [ ] `holding` 态显示剩余帧数，失格立即回退清零。
- [ ] `locked` 态停留 0.6s 后自动进入游戏。
- [ ] 校准通过条件 1.3.2 四项全部实现。
- [ ] 校准期间 `onFace` 不更新 `header.x/y`。
- [ ] 校准超时 15s 显示 Retry + Use Demo。
- [ ] 进入游戏后头部碰撞体与真人头部视觉尺寸接近。

### 4.2 响应
- [ ] `Camera.onFrame` 实现非阻塞发送（`faceMeshBusy` 标志）。
- [ ] 碰撞体位置启用线性预测，碰撞判定用真实位置。
- [ ] 性能自适应三档降级逻辑实现。
- [ ] 中端设备端到端延迟 ≤ 100ms（用 `performance.now()` 在 `onFace` 入口与 `draw` 出口打点验证）。

### 4.3 授权
- [ ] 引入 `permissionState` 四态状态机（unknown/requesting/granted/denied）。
- [ ] **删除** catch 块的 `return startCamera(false)` 递归，改为 `scheduleResume` 线性重试。
- [ ] `requesting` 态下任何入口调用 `getUserMedia` 被硬阻塞（return false）。
- [ ] `btnAgain` 在 `granted` 且 stream 存活时复用 stream，不调 `getUserMedia`。
- [ ] `denied` 后不再 `getUserMedia`，直接 Demo。
- [ ] 设备占用类错误走 `scheduleResume`，最多 2 次，不产生第二次授权弹窗。
- [ ] `navigator.permissions.query` 可用时监听权限恢复（denied→unknown）。
- [ ] `requesting` 态下快速连点 `Play Again` 不产生并发 `getUserMedia`。

### 4.4 兼容与回归
- [ ] 现有游戏循环、物理碰撞、HUD、Demo 回退、game over 流程保持可用。
- [ ] `node --check` 通过。
- [ ] Chrome（localhost）实测：校准 → 游戏 → 失败 → 重开 全链路无报错。
- [ ] 摄像头不可用时自动 Demo，无白屏。

---

## 5. 不在本次范围

- 不重写物理引擎。
- 不改游戏玩法（球速、重力、combo 规则）。
- 不做模块化拆分（保持单文件）。
- 不做 `neck-archive` 的同步修改。
- 不引入新的第三方库（继续用 MediaPipe FaceMesh）。

---

## 6. 交付物

- 修改后的 `neck-project/neck-soccer.html`。
- 在文件头部注释中列出本次改动的三个模块（calibration / responsiveness / permission）。
- 完成后自检 4.x 验收清单，把通过项打勾回传。
