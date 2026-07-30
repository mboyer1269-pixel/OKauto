import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if ("error" in auth) return jsonError(auth.error, auth.status);
  return jsonOk({
    user: auth.user,
    organization: auth.org,
    role: auth.membership.role,
    authMethod: auth.authMethod,
  });
}
