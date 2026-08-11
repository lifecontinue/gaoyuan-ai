/**
 * 共享图标组件 — SVG stroke 图标
 */

import type { ReactNode } from "react"

interface IconProps {
  children: ReactNode
  className?: string
}

export function Icon({ children, className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

/** 播放图标 */
export function PlayIcon() {
  return (
    <Icon>
      <path d="M7 4l12 8-12 8z" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** 暂停图标 */
export function PauseIcon() {
  return (
    <Icon>
      <path d="M8 5v14M16 5v14" />
    </Icon>
  )
}

/** 节拍器图标（梯形机身 + 摆杆；active 时摆杆偏向一侧，暗示"在走"） */
export function MetronomeIcon({ active }: { active: boolean }) {
  return (
    <Icon className={active ? "active-icon" : ""}>
      <path d="M9 3h6l3 18H6z" />
      <path d="M7.4 15h9.2" />
      <path d={active ? "M15.5 6.5L10 17" : "M12 6.5V17"} />
    </Icon>
  )
}

/** 循环图标 */
export function LoopIcon({ active }: { active: boolean }) {
  return (
    <Icon className={active ? "active-icon" : ""}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 013-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 01-3 3H3" />
    </Icon>
  )
}
