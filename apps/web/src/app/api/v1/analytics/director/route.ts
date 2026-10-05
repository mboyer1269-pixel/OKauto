import { withAuth, jsonResponse } from "@/lib/api";
import { getDirectorStats } from "@/lib/sales-ops";

export const GET = withAuth(
  async (_request, { auth }) => {
    const stats = await getDirectorStats(auth.orgId);
    return jsonResponse(stats);
  },
  { minRole: "MANAGER" },
);
