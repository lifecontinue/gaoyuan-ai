/**
 * Vitest 独立配置（DEVELOPMENT_PLAN T1.1）
 *
 * 为什么不复用 vite.config.ts：
 *   1. 主配置里挂了 @vitejs/plugin-react、tailwind vite 插件、以及若干 Figma 资源解析逻辑，
 *      跑 node 单测时全是无谓开销，且插件链一旦报错会掩盖真实的测试失败。
 *   2. Phase 1 的被测对象（dsp / PitchDetector / NoteStabilizer / AnalysisPipeline）
 *      按架构约束**不得引用 window / AudioContext**，因此 environment 固定为 "node" ——
 *      这本身就是一道架构护栏：谁不小心在 lib 里引了 window，测试立刻红。
 *
 * 别名 `@` 必须与 tsconfig.json 的 paths 保持一致，否则源码里的 `@/lib/...` 解析不了。
 */

import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 音频测试里有若干"跑满 1 秒信号 / 46 帧"的用例，默认 5s 偏紧
    testTimeout: 30_000,
    reporters: ["default"],
  },
})
