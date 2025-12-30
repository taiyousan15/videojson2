"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function NewProjectForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const domain = formData.get("domain") as string;
    const language = formData.get("language") as string;

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain, language }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create project");
      }

      const { project } = await response.json();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            プロジェクト名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: YouTube動画シリーズ"
          />
        </div>

        <div>
          <label
            htmlFor="domain"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            ドメイン（任意）
          </label>
          <input
            type="text"
            id="domain"
            name="domain"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: ゲーム実況, 料理, テック"
          />
          <p className="mt-1 text-sm text-gray-500">
            動画の分野やジャンルを指定
          </p>
        </div>

        <div>
          <label
            htmlFor="language"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            言語
          </label>
          <select
            id="language"
            name="language"
            defaultValue="ja"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ko">한국어</option>
          </select>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Link
          href="/projects"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "作成中..." : "プロジェクトを作成"}
        </button>
      </div>
    </form>
  );
}
