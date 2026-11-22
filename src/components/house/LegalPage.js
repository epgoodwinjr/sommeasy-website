import Link from "next/link";
import RunningHead from "./RunningHead";
import SectionHead from "./SectionHead";
import Enter from "./Enter";
import { PAGE_REST } from "./motion";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, TYPE, ink } from "./tokens";
import { numeralCounter } from "@/lib/numerals";
import { LEGAL_CONTACT, LEGAL_DRAFT, LEGAL_EFFECTIVE, LEGAL_UPDATED } from "@/lib/legalCopy";

// /privacy and /terms (launch prep, Nov 2026): a quiet House List page —
// the running head, the title rising, the rest on one fade (PAGE_REST) —
// over the copy in src/lib/legalCopy.js. Readable signed out: no service
// bar, no search.

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `24px ${GUTTER}px 64px` };
const para = { fontFamily: SANS, fontSize: "15px", lineHeight: 1.6, color: INK, marginTop: 12 };
const inline = { color: BURGUNDY, fontWeight: 600, textDecoration: "none" };

const LINKS = {
  privacy: { href: "/privacy", text: "Privacy Policy" },
  terms: { href: "/terms", text: "Terms" },
  account: { href: "/account", text: "Account" },
};

/** A paragraph with its [[tokens]] made links. */
function Rich({ text }) {
  return text.split(/(\[\[[a-z]+\]\])/).map((part, i) => {
    const token = part.match(/^\[\[([a-z]+)\]\]$/)?.[1];
    if (token === "contact") {
      return <a key={i} href={`mailto:${LEGAL_CONTACT}`} style={inline}>{LEGAL_CONTACT}</a>;
    }
    if (token && LINKS[token]) {
      return <Link key={i} href={LINKS[token].href} style={inline}>{LINKS[token].text}</Link>;
    }
    return part;
  });
}

export default function LegalPage({ copy, testId }) {
  const next = numeralCounter();
  return (
    <>
      <RunningHead title={copy.title} hideSearch />
      <main style={column} data-testid={testId}>
        <Enter>
          <h1 style={TYPE.h1}>{copy.title}</h1>
          <p style={{ ...TYPE.sub, marginTop: 8 }}>{copy.sub}</p>
          <p data-testid="legal-dates" style={{ ...TYPE.meta, marginTop: 12 }}>
            Effective {LEGAL_EFFECTIVE} · Last updated {LEGAL_UPDATED}
          </p>
          {LEGAL_DRAFT && (
            <p data-testid="legal-draft" style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", color: BURGUNDY, marginTop: 6,
            }}>Draft for review — not yet in effect.</p>
          )}
        </Enter>
        <Enter {...PAGE_REST}>
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <SectionHead numeral={next()} label={section.heading} style={{ margin: "30px 0 2px" }} />
              {(section.body || []).map((text, i) => <p key={i} style={para}><Rich text={text} /></p>)}
              {section.list && (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: ink(0.6) }}>
                  {section.list.map((text, i) => (
                    <li key={i} style={{ ...para, marginTop: i ? 8 : 0 }}><Rich text={text} /></li>
                  ))}
                </ul>
              )}
              {(section.after || []).map((text, i) => <p key={i} style={para}><Rich text={text} /></p>)}
            </section>
          ))}
        </Enter>
      </main>
    </>
  );
}
