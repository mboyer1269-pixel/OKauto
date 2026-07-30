import { withAuth, jsonResponse } from '@/lib/api';
import { getDashboardStats } from '@/lib/services';

export const GET = withAuth(async (_request, { auth }) => {
  const stats = await getDashboardStats(auth.orgId);
  return jsonResponse(stats);
});
