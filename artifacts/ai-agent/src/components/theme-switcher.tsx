import React from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { id: "original", label: "Original (Bold)", description: "Dark & technical" },
  { id: "warm", label: "Warm & Accessible", description: "Soft, humanistic" },
  { id: "minimal", label: "Minimal & Professional", description: "Zen, elegant" },
  { id: "playful", label: "Playful & Energetic", description: "Vibrant, joyful" },
];

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = React.useState<string>(() => {
    return localStorage.getItem("forge-theme") || "original";
  });

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    localStorage.setItem("forge-theme", themeId);
    
    const html = document.documentElement;
    if (themeId === "original") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", themeId);
    }
  };

  React.useEffect(() => {
    const html = document.documentElement;
    if (currentTheme === "original") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", currentTheme);
    }
  }, []);

  const current = THEMES.find(t => t.id === currentTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="font-mono text-xs gap-2 hover:bg-primary/10 hover:text-primary"
          title={`Current: ${current?.label}`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">DESIGN</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            className={`flex flex-col gap-1 cursor-pointer py-3 ${
              currentTheme === theme.id ? "bg-primary/10" : ""
            }`}
          >
            <div className="font-mono font-bold text-xs">{theme.label}</div>
            <div className="text-[10px] text-muted-foreground">{theme.description}</div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
