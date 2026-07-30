import { orgSettings, prisma } from "@lotpilot/db";
import { OrgSettingsForm } from "@/components/org-settings-form";
import { TokenManager } from "@/components/token-manager";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org, role } = await requireOrgPage(orgId);
  const isManager = role === "OWNER" || role === "MANAGER";
  const settings = orgSettings(org.settings);

  const tokens = await prisma.apiToken.findMany({
    where: {
      organizationId: orgId,
      revokedAt: null,
      ...(isManager ? {} : { userId: user.id }),
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>
      {isManager ? (
        <OrgSettingsForm
          orgId={orgId}
          initial={{
            name: org.name,
            website: org.website ?? "",
            phone: org.phone ?? "",
            address: org.address ?? "",
            city: org.city ?? "",
            state: org.state ?? "",
            zip: org.zip ?? "",
            disclaimers: settings.disclaimers.join("\n"),
            soldDetectionThreshold: settings.soldDetectionThreshold,
            defaultTone: settings.defaultTone,
            defaultLocation: settings.defaultLocation ?? "",
          }}
        />
      ) : null}
      <TokenManager
        orgId={orgId}
        tokens={tokens.map((t) => ({
          id: t.id,
          name: t.name,
          owner: t.user.name,
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
