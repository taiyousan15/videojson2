import { requireAdminOrRedirect } from "@/lib/rbac";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This will redirect non-admin users to /projects
  await requireAdminOrRedirect();

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/projects" className="text-xl font-bold">
                VideoJSON
              </Link>
              <span className="ml-4 px-2 py-1 bg-red-600 text-xs rounded">
                Admin
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/admin/jobs"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
              >
                Jobs
              </Link>
              <Link
                href="/admin/providers"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
              >
                Providers
              </Link>
              <Link
                href="/admin/templates"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
              >
                Templates
              </Link>
              <Link
                href="/admin/models"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
              >
                Models
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
