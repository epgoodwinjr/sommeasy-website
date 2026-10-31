import { headers } from "next/headers";
import MatchList from "./MatchList";

export const metadata = {
  title: "Match the wine list — Sommeasy",
  description: "Share a wine list and we’ll find your best matches.",
};

// The device check /log uses, run on the request so the first paint
// already knows whether "Photograph the list" opens the camera or the file
// picker.
const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod/i;

export default function RecommendPage() {
  const isMobile = MOBILE_UA.test(headers().get("user-agent") || "");
  return <MatchList isMobile={isMobile} />;
}
