import type { Metadata } from "next";
import V3Workspace from "./v3-workspace";

export const metadata: Metadata = {
  title: "The Comp V3 | Discovery",
  description: "Minimal employer discovery workspace for The Comp.",
  robots: { index: false, follow: false },
};

export default function V3Page() {
  return <V3Workspace />;
}
