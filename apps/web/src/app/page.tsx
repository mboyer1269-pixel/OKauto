import { prisma } from "@lotpilot/db";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    if (user.platformRole === "ADMIN") redirect("/admin");
    redirect("/onboarding");
  }
  redirect(`/o/${membership.organizationId}`);
}
