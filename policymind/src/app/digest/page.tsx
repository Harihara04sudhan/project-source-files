import { TopBar } from "@/components/TopBar";
import { DigestClient } from "@/components/DigestClient";
import { listPendingDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const drafts = await listPendingDigest();
  return (
    <>
      <TopBar />
      <main className="flex-1">
        <DigestClient initial={drafts} />
      </main>
    </>
  );
}
