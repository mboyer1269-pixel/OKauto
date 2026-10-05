import { withAuth, jsonResponse } from "@/lib/api";
import { getPublishQueue } from "@/lib/sales-ops";

export const GET = withAuth(async (_request, { auth }) => {
  const queue = await getPublishQueue(auth.orgId, auth.sub);
  return jsonResponse(queue);
});
