/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'roughjs' {
  import { RoughSVG } from 'roughjs/bin/svg'
  export function roughSvg(svg: SVGSVGElement, options?: any): RoughSVG
  export const generator: any
}
