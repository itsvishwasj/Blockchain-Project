import { useEffect } from 'react';
import Navbar from "../components/Navbar";
import { ThemeToggle } from "../components/ThemeToggle";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-900 flex flex-col font-sans transition-colors duration-200">
      <Navbar />
      <main className="flex-1">
        <Component {...pageProps} />
      </main>

      {/* Floating Theme Switcher Pill in Bottom-Right for instant 1-click access */}
      <div className="fixed bottom-5 right-5 z-50">
        <ThemeToggle className="shadow-lg hover:scale-105" />
      </div>
    </div>
  );
}