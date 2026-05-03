import { useState } from "react";
import {
  Terminal, Plus, Activity, CheckCircle2, XCircle, Clock,
  ChevronRight, Cpu, GitBranch, Layers, Search, Zap, BarChart3,
  ArrowUpRight, CircleDot, Filter
} from "lucide-react";

const SESSIONS = [
  { id: 8, status: "failed", lang: "Python", model: "gpt-4.1", task: "Write a Python script that fetches and parses HTML from a URL using requests and BeautifulSoup4", iter: 0, ago: "38m ago" },
  { id: 7, status: "done", lang: "JavaScript", model: "gpt-4.1", task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list", iter: 2, ago: "56m ago" },
  { id: 6, status: "failed", lang: "Python", model: "gpt-4.1", task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list", iter: 5, ago: "2h ago" },
  { id: 5, status: "failed", lang: "JavaScript", model: "gpt-4.1", task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list", iter: 3, ago: "2h ago" },
  { id: 4, status: "failed", lang: "JavaScript", model: "gpt-4.1", task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list", iter: 4, ago: "3h ago" },
  { id: 3, status: "done", lang: "Python", model: "gpt-4.1", task: "Write a FizzBuzz program that prints numbers 1–100", iter: 1, ago: "4h ago" },
  { id: 2, status: "done", lang: "Python", model: "gpt-4.1", task: "Write a FizzBuzz program that prints numbers 1–100", iter: 1, ago: "4h ago" },
  { id: 1, status: "failed", lang: "Python", model: "gpt-4.1", task: "gdfb", iter: 0, ago: "5h ago" },
];

const STATUS_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  done: { color: "#22c55e", icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Done" },
  failed: { color: "#ef4444", icon: <XCircle className="w-3.5 h-3.5" />, label: "Failed" },
  running: { color: "#f59e0b", icon: <CircleDot className="w-3.5 h-3.5" />, label: "Running" },
};

const LANG_COLOR: Record<string, string> = {
  Python: "#3b82f6",
  JavaScript: "#eab308",
  TypeScript: "#06b6d4",
};

export function CommandRail() {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [activeLang, setActiveLang] = useState<string>("all");

  const filtered = SESSIONS.filter((s) => {
    const statusOk = activeFilter === "all" || s.status === activeFilter;
    const langOk = activeLang === "all" || s.lang === activeLang;
    return statusOk && langOk;
  });

  const stats = {
    total: SESSIONS.length,
    done: SESSIONS.filter((s) => s.status === "done").length,
    failed: SESSIONS.filter((s) => s.status === "failed").length,
    successRate: Math.round((SESSIONS.filter((s) => s.status === "done").length / SESSIONS.length) * 100),
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-mono overflow-hidden">
      {/* Left Rail */}
      <aside className="w-56 flex-shrink-0 border-r border-white/8 flex flex-col bg-[#0d0d0d]">
        {/* Logo */}
        <div className="px-4 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 flex items-center justify-center rounded-sm">
              <Terminal className="w-4 h-4 text-black" />
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-widest text-white">FORGE</div>
              <div className="text-[9px] text-white/30 tracking-wider uppercase">AI Coding Agent</div>
            </div>
          </div>
        </div>

        {/* New Session CTA */}
        <div className="px-3 pt-3 pb-2">
          <button className="w-full flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-black text-[11px] font-bold py-2 rounded-sm tracking-wider uppercase transition-colors">
            <Plus className="w-3.5 h-3.5" />
            New Session
          </button>
        </div>

        {/* Nav */}
        <nav className="px-2 py-1 flex flex-col gap-0.5 flex-1">
          <div className="px-2 py-0.5 mb-1">
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">View</span>
          </div>
          {[
            { icon: <Layers className="w-3.5 h-3.5" />, label: "All Sessions", count: stats.total, active: true },
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Successful", count: stats.done },
            { icon: <XCircle className="w-3.5 h-3.5" />, label: "Failed", count: stats.failed },
            { icon: <Activity className="w-3.5 h-3.5" />, label: "Active", count: 0 },
          ].map((item) => (
            <button
              key={item.label}
              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-[11px] transition-colors ${
                item.active ? "bg-white/8 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/4"
              }`}
            >
              <span className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
              <span className="text-[10px] text-white/30">{item.count}</span>
            </button>
          ))}

          <div className="px-2 py-0.5 mt-3 mb-1">
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">Language</span>
          </div>
          {["all", "Python", "JavaScript", "TypeScript"].map((lang) => (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-[11px] transition-colors ${
                activeLang === lang ? "bg-white/8 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/4"
              }`}
            >
              {lang !== "all" && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: LANG_COLOR[lang] }}
                />
              )}
              {lang === "all" ? "All Languages" : lang}
            </button>
          ))}

          <div className="px-2 py-0.5 mt-3 mb-1">
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">Model</span>
          </div>
          <button className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[11px] bg-white/8 text-white">
            <Cpu className="w-3.5 h-3.5 text-orange-400" />
            gpt-4.1
          </button>
        </nav>

        {/* Stats Footer */}
        <div className="border-t border-white/8 px-3 py-3 grid grid-cols-2 gap-2">
          <div className="bg-white/4 rounded-sm p-2 text-center">
            <div className="text-lg font-bold text-green-400">{stats.successRate}%</div>
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Success</div>
          </div>
          <div className="bg-white/4 rounded-sm p-2 text-center">
            <div className="text-lg font-bold text-white">{stats.total}</div>
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Total</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top strip — compact stats */}
        <div className="flex items-center gap-0 border-b border-white/8 flex-shrink-0">
          {[
            { label: "SESSIONS", value: stats.total, icon: <Layers className="w-3 h-3" />, color: "text-white" },
            { label: "SUCCESS RATE", value: `${stats.successRate}%`, icon: <Activity className="w-3 h-3" />, color: "text-green-400" },
            { label: "AVG ITER", value: "2.4", icon: <GitBranch className="w-3 h-3" />, color: "text-blue-400" },
            { label: "FILES GEN", value: "28", icon: <BarChart3 className="w-3 h-3" />, color: "text-orange-400" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`flex items-center gap-2 px-4 py-3 flex-1 ${i < 3 ? "border-r border-white/8" : ""}`}
            >
              <span className="text-white/30">{s.icon}</span>
              <div>
                <div className="text-[9px] text-white/30 uppercase tracking-widest">{s.label}</div>
                <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/8 bg-[#0d0d0d] flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 px-2.5 py-1.5 rounded-sm flex-1 max-w-xs">
            <Search className="w-3 h-3 text-white/30" />
            <input
              className="bg-transparent text-[11px] text-white/50 placeholder:text-white/25 outline-none w-full"
              placeholder="Filter tasks..."
            />
          </div>
          <div className="flex items-center gap-1">
            {["all", "done", "failed"].map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-sm transition-colors ${
                  activeFilter === f
                    ? "bg-white/10 text-white"
                    : "text-white/30 hover:text-white/50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-white/25">
            <Filter className="w-3 h-3" />
            {filtered.length} results
          </div>
        </div>

        {/* Session Table */}
        <div className="flex-1 overflow-y-auto">
          {/* Header row */}
          <div className="grid grid-cols-[48px_80px_88px_1fr_64px_72px] gap-0 px-4 py-1.5 border-b border-white/5 sticky top-0 bg-[#0a0a0a]">
            {["ID", "STATUS", "LANG", "DIRECTIVE", "ITER", "WHEN"].map((h) => (
              <div key={h} className="text-[9px] uppercase tracking-widest text-white/20 font-bold">{h}</div>
            ))}
          </div>

          {filtered.map((s) => {
            const meta = STATUS_META[s.status];
            return (
              <div
                key={s.id}
                className="grid grid-cols-[48px_80px_88px_1fr_64px_72px] gap-0 px-4 py-2.5 border-b border-white/4 hover:bg-white/3 cursor-pointer group transition-colors items-center"
              >
                <div className="text-[10px] text-white/30">_{s.id.toString().padStart(4, "0")}</div>
                <div className="flex items-center gap-1" style={{ color: meta.color }}>
                  {meta.icon}
                  <span className="text-[10px] uppercase tracking-wider">{meta.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: LANG_COLOR[s.lang] || "#888" }}
                  />
                  <span className="text-[10px] text-white/50">{s.lang}</span>
                </div>
                <div className="text-[11px] text-white/60 truncate pr-4">{s.task}</div>
                <div className="text-[11px] text-white/40">{s.iter}×</div>
                <div className="flex items-center justify-between text-[10px] text-white/25">
                  {s.ago}
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
