import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { authenticate } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { DashboardClient } from "./workspace";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  try {
    await authenticate();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
  return <DashboardClient />;
}
