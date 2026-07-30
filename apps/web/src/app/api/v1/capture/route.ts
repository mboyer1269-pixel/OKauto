import { ingestCapture, resolveExtensionCredential } from "@okauto/db";
import { CapturePayloadSchema } from "@okauto/shared";
import { jsonError } from "@/lib/http";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return jsonError("MISSING_EXTENSION_TOKEN", "Capture requests require an extension bearer token.", 401);
  }

  const credential = await resolveExtensionCredential(token);
  if (!credential) {
    return jsonError("INVALID_EXTENSION_TOKEN", "Extension token is invalid or revoked.", 401);
  }

  const dealership = credential.organization.dealerships[0];
  if (!dealership) {
    return jsonError("NO_DEALERSHIP", "Organization must have at least one dealership before capture.", 409);
  }

  try {
    const payload = CapturePayloadSchema.parse(await request.json());
    const result = await ingestCapture(credential.organizationId, dealership.id, payload);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("INVALID_CAPTURE_PAYLOAD", error.issues.map((issue) => issue.message).join("; "), 422);
    }
    console.error("capture_ingest_failed", error);
    return jsonError("CAPTURE_INGEST_FAILED", "Unable to ingest captured vehicle.", 500);
  }
}
