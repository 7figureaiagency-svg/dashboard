import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      className={`apple-button size-8.5 rounded-xl border-border/40 bg-card/80 hover:bg-muted shadow-2xs transition-colors duration-200 ${className ?? ""}`}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="size-3.5 text-amber-500 transition-transform duration-300 rotate-0 scale-100 hover:rotate-45" />
      ) : (
        <Moon className="size-3.5 text-slate-700 dark:text-slate-300 transition-transform duration-300 rotate-0 scale-100 hover:-rotate-12" />
      )}
    </Button>
  );
}
