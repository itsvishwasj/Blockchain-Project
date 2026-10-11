import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ className = '', showLabel = true }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme');
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDarkMode = saved === 'dark' || (!saved && prefersDark) || document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    if (nextTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  if (!mounted) {
    return (
      <button
        className={`p-2 rounded-xl border border-slate-200 bg-white text-slate-600 ${className}`}
        aria-label="Toggle Theme"
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={isDark ? "Switch to Light Mode" : "Switch to GitHub Dark Mode"}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-xs font-bold shadow-xs active:scale-[0.98] ${
        isDark
          ? "bg-[#21262d] border-[#30363d] text-[#e6edf3] hover:bg-[#30363d] hover:border-[#8b949e]"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
      } ${className}`}
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-400" />
          {showLabel && <span className="hidden sm:inline">Light</span>}
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-slate-600" />
          {showLabel && <span className="hidden sm:inline">Dark</span>}
        </>
      )}
    </button>
  );
}

export default ThemeToggle;
