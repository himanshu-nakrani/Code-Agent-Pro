import { useState } from "react";
import {
  Terminal, Plus, CheckCircle2, XCircle, GitBranch,
  Search, Clock, ChevronRight, Activity, Cpu, Zap,
  RotateCcw, Archive, MoreHorizontal, Filter, Download
} from "lucide-react";

const SESSIONS = [
  {
    id: 8, status: "failed", lang: "Python", model: "gpt-4.1",
    task: "Write a Python script that fetches and parses HTML from a URL using requests and BeautifulSoup4, extracts all links and headings, and prints a structured report",
    iter: 0, files: 0, ago: "38m ago", duration: "1m 12s",
  },
  {
    id: 7, status: "done", lang: "JavaScript", model: "gpt-4.1",
    task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list (create, read, update, delete todos)",
    iter: 2, files: 4, ago: "56m ago", duration: "3m 45s",
  },
  {
    id: 6, status: "failed", lang: "Python", model: "gpt-4.1",
    task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list (create, read, update, delete todos)",
    iter: 5, files: 3, ago: "2h ago", duration: "8m 22s",
  },
  {
    id: 5, status: "failed", lang: "JavaScript", model: "gpt-4.1",
    task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list (create, read, update, delete todos)",
    iter: 3, files: 2, ago: "2h ago", duration: "5m 08s",
  },
  {
    id: 4, status: "failed", lang: "JavaScript", model: "gpt-4.1",
    task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list (create, read, update, delete todos)",
    iter: 4, files: 3, ago: "3h ago", duration: "6m 55s",
  },
  {
    id: 3, status: "done", lang: "Python", model: "gpt-4.1",
    task: "Write a FizzBuzz program that prints numbers 1–100. For multiples of 3 print Fizz, multiples of 5 print Buzz, multiples of both print FizzBuzz",
    iter: 1, files: 1, ago: "4h ago", duration: "58s",
  },
  {
    id: 2, status: "done", lang: "Python", model: "gpt-4.1",
    task: "Write a FizzBuzz program that prints numbers 1–100. For multiples of 3 print Fizz, multiples of 5 print Buzz, multiples of both print FizzBuzz",
    iter: 1, files: 1, ago: "4h ago", duration: "52s",
  },
  {
    id: 1, status: "failed", lang: "Python", model: "gpt-4.1",
    task: "gdfb",
    iter: 0, files: 0, ago: "5h ago", duration: "22s",
  },
];

const STATUS_META: Record<string, {
  border: string; headerBg: string; badge: string; icon: React.ReactNode; label: string; glow: string;
}> = {
  done: {
    border: "border-l-green-500",
    headerBg: "bg-green-500/5",
    badge: "bg-green-500/15 text-green-400 border-green-500/20",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: "DONE",
    glow: "shadow-[inset_0_0_0_1px_rgba(34,197,94,0.08)]",
  },
  failed: {
    border: "border-l-red-500",
    headerBg: "bg-red-500/5",
    badge: "bg-red-500/15 text-red-400 border-red-500/20",
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: "FAILED",
    glow: "shadow-[inset_0_0_0_1px_rgba(239,68,68,0.08)]",
  },
};

const LANG_COLOR: Record<string, string> = {
  Python: "#60a5fa",
  JavaScript: "#fbbf24",
  TypeScript: "#22d3ee",
};

export function EditorialFeed() {
  const [search, setSearch] = useState("");

  const stats = {
    total: SESSIONS.length,
    done: SESSIONS.filter((s) => s.status === "done").length,
    rate: Math.round((SESSIONS.filter((s) => s.status === "done").length / SESSIONS.length) * 100),
    avgIter: (SESSIONS.reduce((a, s) => a + s.iter, 0) / SESSIONS.length).toFixed(1),
  };

  const filtered = SESSIONS.filter((s) =>
    s.task.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#090909] text-white overflow-auto">
      {/* Masthead */}
      <header className="sticky top-0 z-10 bg-[#090909]/95 backdrop-blur-sm border-b border-white/8">
        <div className="flex items-center justify-between px-5 py-2.5">
          {/* Brand + inline stats */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-orange-500 flex items-center justify-center">
                <Terminal className="w-3.5 h-3.5 text-black" />
              </div>
              <span className="font-mono text-[13px] font-bold tracking-widest text-white">FORGE</span>
            </div>
            {/* Inline stat pills */}
            <div className="hidden sm:flex items-center gap-1.5">
              {[
                { label: `${stats.total} sessions`, color: "text-white/50" },
                { label: `${stats.rate}% pass`, color: "text-green-400/70" },
                { label: `${stats.avgIter} avg iter`, color: "text-blue-400/70" },
              ].map((pill) => (
                <span
                  key={pill.label}
                  className={`font-mono text-[10px] px-2 py-0.5 bg-white/5 border border-white/8 rounded-full ${pill.color}`}
                >
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 px-2.5 py-1.5 rounded-sm">
              <Search className="w-3 h-3 text-white/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent font-mono text-[11px] text-white/60 placeholder:text-white/20 outline-none w-36"
                placeholder="Search directives..."
              />
            </div>
            <button className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-black font-mono text-[11px] font-bold px-3 py-1.5 uppercase tracking-wider transition-colors">
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-1.5 border-t border-white/5">
          <div className="flex items-center gap-0.5">
            {["All", "Done", "Failed", "Python", "JavaScript"].map((f) => (
              <button
                key={f}
                className="px-2 py-0.5 font-mono text-[10px] text-white/30 hover:text-white/60 hover:bg-white/5 rounded-sm transition-colors uppercase tracking-wider"
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="flex items-center gap-1 text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors">
              <Download className="w-3 h-3" /> CSV
            </button>
            <span className="font-mono text-[10px] text-white/20">{filtered.length} results</span>
          </div>
        </div>
      </header>

      {/* Feed */}
      <div className="max-w-4xl mx-auto px-5 py-4 space-y-2.5">
        {filtered.map((s) => {
          const meta = STATUS_META[s.status] || STATUS_META.failed;
          return (
            <article
              key={s.id}
              className={`border-l-2 ${meta.border} bg-[#0f0f0f] border border-white/6 hover:border-white/10 cursor-pointer group transition-all ${meta.glow}`}
            >
              {/* Card header */}
              <div className={`flex items-center gap-3 px-4 py-2 ${meta.headerBg} border-b border-white/5`}>
                <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm ${meta.badge}`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <span className="font-mono text-[10px] text-white/25">
                  ID_{s.id.toString().padStart(4, "0")}
                </span>
                <div className="flex items-center gap-1 ml-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: LANG_COLOR[s.lang] || "#888" }}
                  />
                  <span className="font-mono text-[10px] text-white/40">{s.lang}</span>
                </div>
                <span className="font-mono text-[10px] text-white/25 flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {s.model}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="font-mono text-[10px] text-white/25 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {s.iter} iter
                  </span>
                  <span className="font-mono text-[10px] text-white/20 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {s.duration}
                  </span>
                  <span className="font-mono text-[10px] text-white/20">{s.ago}</span>
                  <MoreHorizontal className="w-3.5 h-3.5 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Task text — editorial, large */}
              <div className="px-4 py-3 flex items-start justify-between gap-4">
                <p className="font-sans text-[13px] text-white/75 leading-relaxed flex-1 line-clamp-2">
                  {s.task}
                </p>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  {s.files > 0 && (
                    <span className="font-mono text-[10px] text-white/25 border border-white/8 px-1.5 py-0.5 rounded-sm">
                      {s.files} files
                    </span>
                  )}
                  {s.status === "failed" && (
                    <button className="flex items-center gap-1 font-mono text-[10px] text-orange-400/60 hover:text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-all">
                      <RotateCcw className="w-3 h-3" />
                      Rerun
                    </button>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 opacity-0 group-hover:opacity-60 transition-opacity" />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
