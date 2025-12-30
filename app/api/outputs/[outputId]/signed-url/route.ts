import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ outputId: string }>;
};

// Generate signed URL for GCS (simplified for development)
async function generateSignedUrl(gcsUri: string): Promise<string> {
  // In production, use @google-cloud/storage to generate signed URLs
  // For development, return the GCS URI as-is or a mock URL

  if (process.env.USE_GCS_SIGNED_URLS === "true") {
    try {
      const { Storage } = await import("@google-cloud/storage");
      const storage = new Storage();

      // Parse gs://bucket/path format
      const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        throw new Error("Invalid GCS URI format");
      }

      const [, bucketName, filePath] = match;
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);

      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      return signedUrl;
    } catch (error) {
      console.error("Failed to generate signed URL:", error);
      throw error;
    }
  }

  // Development mode: return mock URL
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/mock-download?uri=${encodeURIComponent(gcsUri)}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { outputId } = await context.params;

  const output = await prisma.output.findUnique({
    where: { id: outputId },
    include: {
      video: {
        select: { projectId: true },
      },
    },
  });

  if (!output) {
    return NextResponse.json({ error: "Output not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, output.video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const signedUrl = await generateSignedUrl(output.gcsUri);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    return NextResponse.json({
      outputId: output.id,
      name: output.name,
      format: output.format,
      signedUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
