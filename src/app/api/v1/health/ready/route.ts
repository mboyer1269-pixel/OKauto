import { NextRequest } from "next/server";

import { sqlClient } from "@/db";
import { errorResponse, json, requestId } from "@/lib/http";

export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    await sqlClient()`select 1`;
    return json({ status: "ready", database: "ok" }, {}, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
