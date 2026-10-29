import { Outlet } from "react-router-dom";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";

export function AppShell() {
  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar-background lg:block">
        <Sidebar />
      </aside>

      {/* Main content area. min-w-0 lets this flex item shrink below the
          min-content width of wide children (e.g. data tables), so they scroll
          inside their own overflow-x-auto container instead of stretching the
          page past the viewport, where the overflow-x-hidden above clips it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-4 pb-20 lg:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  );
}
