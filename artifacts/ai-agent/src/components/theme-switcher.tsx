import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEMES = [
  { id: "warm", label: "Warm & Professional", description: "Soft, elegant" },
  { id: "minimal", label: "Minimal", description: "Clean, zen" },
  { id: "playful", label: "Playful", description: "Vibrant, energetic" },
  { id: "original", label: "Bold", description: "Technical, dark" },
];

export function ThemeSwitcher() {
  const handleThemeChange = (themeId: string) => {
    localStorage.setItem("forge-theme", themeId);
    const html = document.documentElement;
    if (themeId === "original") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", themeId);
    }
    window.location.reload();
  };

  const currentTheme = typeof window !== "undefined" ? (localStorage.getItem("forge-theme") || "warm") : "warm";
  const current = THEMES.find(t => t.id === currentTheme);

  return (
    <div className="relative group">
      <Button 
        variant="ghost" 
        size="sm" 
        className="font-mono text-xs gap-2 hover:bg-primary/10 hover:text-primary"
        title={`Current: ${current?.label}`}
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">DESIGN</span>
      </Button>
      
      <div className="absolute right-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="bg-card border border-border rounded shadow-lg overflow-hidden w-48 py-1">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors text-sm flex flex-col gap-0.5 ${
                currentTheme === theme.id ? "bg-primary/20 border-l-2 border-primary" : ""
              }`}
            >
              <div className="font-mono font-bold text-xs">{theme.label}</div>
              <div className="text-[10px] text-muted-foreground">{theme.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
