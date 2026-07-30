import { getDashboardData } from "@/lib/dashboard";
import { getSessionFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return jsonError("UNAUTHORIZED", "Sign in to access dashboard data.", 401);
  }

  const dashboard = await getDashboardData(session);
  return NextResponse.json(dashboard);
}
