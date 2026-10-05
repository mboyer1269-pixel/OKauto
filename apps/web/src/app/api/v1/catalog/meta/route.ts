import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { buildOrganizationCatalogCsv } from "@/lib/sales-ops";

export const GET = withAuth(
  async (_request, { auth }) => {
    const csv = await buildOrganizationCatalogCsv(auth.orgId);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="catalogue-vehicules-meta.csv"',
        "Cache-Control": "no-store",
      },
    });
  },
  { minRole: "MANAGER" },
);
