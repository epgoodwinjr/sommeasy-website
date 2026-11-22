import Link from "next/link";
import { BURGUNDY, SANS } from "./tokens";

// The two legal pages, as a quiet line of links (launch prep, Nov 2026):
// Welcome's footer, sign in and Account. Create account names them in its
// consent line instead. Each link's padding carries the 40px tap floor.
const link = {
  fontFamily: SANS, fontSize: "12px", fontWeight: 600, lineHeight: "16px",
  color: BURGUNDY, opacity: 0.75, padding: "12px 0", textDecoration: "none", whiteSpace: "nowrap",
};

export default function LegalLinks({ style }) {
  return (
    <nav aria-label="Legal" data-testid="legal-links" style={{ display: "flex", justifyContent: "center", gap: 22, ...style }}>
      <Link href="/privacy" style={link}>Privacy</Link>
      <Link href="/terms" style={link}>Terms</Link>
    </nav>
  );
}
