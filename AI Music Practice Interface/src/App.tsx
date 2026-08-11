/**
 * App — 根组件
 *
 * 组合 TopBar + 当前视图（practice / library）。
 * 状态由 zustand stores 管理，组件保持纯展示。
 */

import { useSessionStore } from "@/lib/store/sessionStore"
import { TopBar } from "@/components/topbar/TopBar"
import { PracticeStage } from "@/components/stage/PracticeStage"
import { CoachPanel } from "@/components/coach/CoachPanel"
import { LibraryView } from "@/components/library/LibraryView"

export default function App() {
  const view = useSessionStore((s) => s.view)

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <TopBar />
      {view === "library" ? (
        <LibraryView />
      ) : (
        <section className="workspace">
          <PracticeStage />
          <CoachPanel />
        </section>
      )}
    </main>
  )
}
