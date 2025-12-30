import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">VideoJSON</h1>
        <p className="text-lg text-gray-600 mb-8">
          Video to JSON structured production system
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          プロジェクト一覧へ
        </Link>
      </div>
    </main>
  );
}
