import { prisma } from "@okauto/database";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api";
import { hashToken } from "@/lib/auth";
import {
  MEMBER_INVITE_INVALID_MESSAGE,
  MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE,
  inviteLoginPath,
} from "@/lib/member-provisioning";

export async function GET(
  _request: Request,
  segmentData: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await segmentData.params;
    const invite = await prisma.organizationInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { name: true } } },
    });
    if (
      !invite ||
      invite.consumedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      return errorResponse(MEMBER_INVITE_INVALID_MESSAGE, 404);
    }

    return jsonResponse({
      email: invite.email,
      name: invite.name,
      role: invite.role,
      organizationName: invite.organization.name,
      expiresAt: invite.expiresAt.toISOString(),
      loginUrl: inviteLoginPath(token),
      prompt: MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
