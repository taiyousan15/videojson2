import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        video: {
          select: {
            id: true,
            sourceUrl: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { artifacts: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.job.count({ where }),
  ]);

  // Get job statistics
  const stats = await prisma.job.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  const statusCounts = stats.reduce(
    (acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    },
    {} as Record<string, number>
  );

  return NextResponse.json({
    jobs,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + jobs.length < total,
    },
    stats: statusCounts,
  });
}
