import { TopBar } from "@/components/TopBar";
import { DemoConsole } from "@/components/DemoConsole";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <>
      <TopBar />
      <main className="flex-1">
        <DemoConsole />
      </main>
    </>
  );
}
