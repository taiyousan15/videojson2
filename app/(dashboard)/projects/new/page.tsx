import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          新規プロジェクト
        </h1>
        <NewProjectForm />
      </div>
    </main>
  );
}
