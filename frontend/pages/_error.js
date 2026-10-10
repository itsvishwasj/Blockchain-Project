export default function ErrorPage({ statusCode }) {
  return (
    <div className="min-h-screen bg-[#f3f6fc] flex flex-col items-center justify-center px-4 text-center font-sans">
      <div className="bg-white border border-slate-100 p-8 rounded-3xl max-w-md w-full shadow-xs space-y-4">
        <h1 className="text-3xl font-black text-slate-900">
          {statusCode ? `Error ${statusCode}` : "An Error Occurred"}
        </h1>
        <p className="text-xs text-slate-600">
          {statusCode === 404
            ? "The page you are looking for does not exist."
            : "An unexpected error occurred. Please return to the homepage or try again."}
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 text-white font-bold text-xs px-5 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-xs"
        >
          ← Return to Home
        </a>
      </div>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};
