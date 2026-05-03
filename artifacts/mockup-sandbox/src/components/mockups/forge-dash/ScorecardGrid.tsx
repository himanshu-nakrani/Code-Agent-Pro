import {
  Activity, CheckCircle2, XCircle, GitBranch, Layers,
  Cpu, Terminal, Plus, TrendingUp, TrendingDown, ArrowRight,
  Zap, BarChart2, FileCode, Clock
} from "lucide-react";

const SESSIONS = [
  { id: 8, status: "failed", lang: "Python", model: "gpt-4.1", task: "Fetch and parse HTML from a URL using requests and BeautifulSoup4", iter: 0, ago: "38m" },
  { id: 7, status: "done", lang: "JavaScript", model: "gpt-4.1", task: "REST API with in-memory store — CRUD for todo list", iter: 2, ago: "56m" },
  { id: 6, status: "failed", lang: "Python", model: "gpt-4.1", task: "REST API with in-memory store — CRUD for todo list", iter: 5, ago: "2h" },
  { id: 5, status: "failed", lang: "JavaScript", model: "gpt-4.1", task: "REST API with in-memory store — CRUD for todo list", iter: 3, ago: "2h" },
  { id: 4, status: "failed", lang: "JavaScript", model: "gpt-4.1", task: "REST API with in-memory store — CRUD for todo list", iter: 4, ago: "3h" },
  { id: 3, status: "done", lang: "Python", model: "gpt-4.1", task: "FizzBuzz 1–100", iter: 1, ago: "4h" },
];

const SCORECARD_DATA = [
  {
    label: "Total Sessions",
    value: "8",
    sub: "+2 today",
    trend: "up",
    icon: <Layers className="w-5 h-5" />,
    accent: "#f97316",
    bg: "from-orange-500/10 to-transparent",
  },
  {
    label: "Success Rate",
    value: "37.5%",
    sub: "3 of 8 passed",
    trend: "down",
    icon: <Activity className="w-5 h-5" />,
    accent: "#22c55e",
    bg: "from-green-500/10 to-transparent",
  },
  {
    label: "Avg Iterations",
    value: "2.4",
    sub: "Per session",
    trend: "neutral",
    icon: <GitBranch className="w-5 h-5" />,
    accent: "#3b82f6",
    bg: "from-blue-500/10 to-transparent",
  },
  {
    label: "Files Generated",
    value: "28",
    sub: "Across all sessions",
    trend: "up",
    icon: <FileCode className="w-5 h-5" />,
    accent: "#a855f7",
    bg: "from-purple-500/10 to-transparent",
  },
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bar: string }> = {
  done: { label: "DONE", dot: "bg-green-500", text: "text-green-400", bar: "bg-green-500" },
  failed: { label: "FAILED", dot: "bg-red-500", text: "text-red-400", bar: "bg-red-500" },
  running: { label: "RUNNING", dot: "bg-amber-400", text: "text-amber-400", bar: "bg-amber-400" },
};

export function ScorecardGrid() {
  return (
    <div className="min-h-screen bg-[#080808] text-white font-mono overflow-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-orange-500 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-black" />
          </div>
          <span className="text-[13px] font-bold tracking-widest">FORGE</span>
          <span className="text-[10px] text-white/25 uppercase tracking-wider">AI Coding Agent</span>
        </div>
        <button className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-black text-[11px] font-bold px-3 py-1.5 uppercase tracking-wider transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New Session
        </button>
      </header>

      <div className="px-6 py-5">
        {/* Scorecard Grid — dominates the top */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {SCORECARD_DATA.map((card) => (
            <div
              key={card.label}
              className={`relative bg-[#111] border border-white/8 p-5 overflow-hidden group hover:border-white/16 transition-colors`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.bg} opacity-60`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <span style={{ color: card.accent }}>{card.icon}</span>
                  {card.trend === "up" && <TrendingUp className="w-3.5 h-3.5 text-green-500/60" />}
                  {card.trend === "down" && <TrendingDown className="w-3.5 h-3.5 text-red-500/60" />}
                </div>
                <div className="text-3xl font-bold tracking-tight mb-0.5" style={{ color: card.accent }}>
                  {card.value}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{card.label}</div>
                <div className="text-[10px] text-white/25">{card.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Model Performance Band */}
        <div className="border border-white/8 bg-[#0d0d0d] mb-6">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Model Performance</span>
            </div>
            <span className="text-[9px] text-white/25">8 runs</span>
          </div>
          <div className="px-4 py-3 flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-[11px] text-white/70">gpt-4.1</span>
            </div>
            <div className="flex items-center gap-6 flex-1">
              <div>
                <div className="text-lg font-bold text-green-400">38%</div>
                <div className="text-[9px] text-white/25 uppercase tracking-wider">Success</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-400">2.4</div>
                <div className="text-[9px] text-white/25 uppercase tracking-wider">Avg Iter</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-400">5</div>
                <div className="text-[9px] text-white/25 uppercase tracking-wider">Failed</div>
              </div>
              <div className="flex-1 max-w-48">
                <div className="flex justify-between text-[9px] text-white/25 mb-1">
                  <span>pass rate</span>
                  <span>38%</span>
                </div>
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full" style={{ width: "38%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Session List — compact, data-table style */}
        <div className="border border-white/8">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-[#0d0d0d]">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Recent Directives</span>
              <span className="text-[10px] text-white/25">({SESSIONS.length})</span>
            </div>
            <button className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div>
            {SESSIONS.map((s, idx) => {
              const cfg = STATUS_CONFIG[s.status];
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-0 hover:bg-white/3 cursor-pointer group transition-colors ${
                    idx < SESSIONS.length - 1 ? "border-b border-white/4" : ""
                  }`}
                >
                  {/* Status bar */}
                  <div className={`w-0.5 self-stretch ${cfg.bar} opacity-60`} />

                  <div className="flex items-center gap-3 px-4 py-2.5 flex-1 min-w-0">
                    <span className="text-[10px] text-white/20 shrink-0 w-12">
                      ID_{s.id.toString().padStart(4, "0")}
                    </span>
                    <div className={`flex items-center gap-1 shrink-0 w-20 ${cfg.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      <span className="text-[10px] uppercase tracking-wider">{cfg.label}</span>
                    </div>
                    <span className="text-[10px] text-white/30 shrink-0 w-20">{s.lang}</span>
                    <span className="text-[11px] text-white/55 truncate flex-1">{s.task}</span>
                    <div className="flex items-center gap-4 shrink-0 ml-auto">
                      <span className="text-[10px] text-white/25">{s.iter} iter</span>
                      <span className="text-[10px] text-white/20">{s.ago}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
