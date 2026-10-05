import { withAuth, jsonResponse } from "@/lib/api";
import { getTodayQueue } from "@/lib/sales-ops";

export const GET = withAuth(async (_request, { auth }) => {
  return jsonResponse(await getTodayQueue(auth.orgId, auth.sub));
});
