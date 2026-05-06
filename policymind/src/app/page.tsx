import { TopBar } from "@/components/TopBar";
import { DashboardClient } from "@/components/DashboardClient";
import { getDashboardStats, getLearningCurve, getRecentEvents, listPendingDigest, listRatifiedPolicies } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [drafts, ratified, stats, recent, curve] = await Promise.all([
    listPendingDigest(),
    listRatifiedPolicies(),
    getDashboardStats(),
    getRecentEvents(undefined, 30),
    getLearningCurve(),
  ]);
  return (
    <>
      <TopBar />
      <main className="flex-1">
        <DashboardClient
          initial={{
            drafts,
            ratified,
            stats,
            recent: recent as never,
            curve,
          }}
        />
      </main>
    </>
  );
}
