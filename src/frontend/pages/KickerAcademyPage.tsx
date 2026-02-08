import { Navigation } from "@/frontend/components/Navigation";

export function KickerAcademyPage() {
  const handleSeriousClick = () => {
    // Direct redirect - route never appears in URL or history
    window.location.href = "https://www.youtube.com/watch?v=xvFZjo5PgG0";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Kicker Academy
          </h1>

          <div className="flex flex-col items-center space-y-6">
            <img
              src="/git-gud.webp"
              alt="Git gud scrub"
              className="max-w-md w-full h-auto"
            />

            <button
              onClick={handleSeriousClick}
              className="text-lg text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
            >
              No but seriously...
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
