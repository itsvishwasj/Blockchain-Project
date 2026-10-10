export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#f3f6fc] flex flex-col items-center justify-center px-4 text-center font-sans">
      <div className="bg-white border border-slate-100 p-8 rounded-3xl max-w-md w-full shadow-xs space-y-4">
        <div className="text-4xl mb-1">🔍</div>
        <h1 className="text-2xl font-black text-slate-900">404 - Page Not Found</h1>
        <p className="text-xs text-slate-600">
          The requested route does not exist or has been moved.
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 text-white font-bold text-xs px-5 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-xs"
        >
          ← Return to Dashboard Overview
        </a>
      </div>
    </div>
  );
}
