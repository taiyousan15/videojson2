import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { generateSignedUploadUrl } from "@/lib/gcs";
import { z } from "zod";
import { randomUUID } from "crypto";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const requestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().regex(/^video\//, "Content type must be a video MIME type"),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { fileName, contentType } = parsed.data;

  try {
    // Create a video record for the upload
    const video = await prisma.video.create({
      data: {
        projectId,
        sourceType: "UPLOAD",
        title: fileName,
        status: "PENDING",
      },
    });

    const gcsPath = `projects/${projectId}/uploads/${video.id}/${randomUUID()}-${fileName}`;
    const { signedUrl, gcsUri } = await generateSignedUploadUrl(gcsPath, contentType);

    // Update video with GCS URI
    await prisma.video.update({
      where: { id: video.id },
      data: { gcsUri },
    });

    return NextResponse.json({
      signedUrl,
      gcsUri,
      videoId: video.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate upload URL: ${message}` },
      { status: 500 }
    );
  }
}
