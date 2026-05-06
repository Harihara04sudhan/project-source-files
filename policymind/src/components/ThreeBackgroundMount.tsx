"use client";

// Client wrapper that lazy-loads the 3D scene on mount. Lets us keep `ssr:false`
// out of server components (Next 16 forbids it there) while still skipping
// WebGL bundling on the server.

import dynamic from "next/dynamic";

const ThreeBackground = dynamic(
  () => import("./ThreeBackground").then((m) => m.ThreeBackground),
  { ssr: false, loading: () => null },
);

export function ThreeBackgroundMount() {
  return <ThreeBackground />;
}
