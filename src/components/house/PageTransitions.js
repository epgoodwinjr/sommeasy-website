"use client";

// PageTransitions — THE TRIAL from docs/motion/README.md §6 (for Ed's
// review): a 200ms cross-fade from page to page through the browser's own
// View Transitions API, with the RunningHead held still. Progressive
// enhancement, and one removable file: delete it, its line in layout.js,
// the ::view-transition rules in globals.css and RunningHead's
// viewTransitionName, and nothing else knows it existed.
//
// How: the App Router commits a new page some time after router.push(), so
// the push has to happen INSIDE document.startViewTransition's callback —
// the browser takes its "before" picture, then we navigate, and the "after"
// picture waits for the new pathname to commit. This wraps the router's own
// push/replace (the object next/link calls too), so links, entries and
// programmatic pushes all cross-fade, and nothing intercepts a click.
//
// What it leaves alone, on purpose:
//   · Back and forward (popstate). React restores those pages itself, and
//     nothing can hold that render for the "before" picture. The back trail
//     (navTrail) is untouched — it never sees this file.
//   · A change of query on the same page (a wine → wine hop, ?tab=, ?q=).
//   · Reduced motion, a hidden tab, and browsers without the API: a plain
//     navigation, exactly as before.
// The old page is never held longer than HOLD_MS: a slow route simply
// arrives without the fade. The overlay takes no taps (globals.css).

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { prefersReducedMotion } from "./motion";
import { useIsoLayoutEffect } from "./useEntrance";

const HOLD_MS = 600;

export default function PageTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  const landed = useRef(null);

  // The new page has committed (and Next has set its scroll): the browser
  // may take its "after" picture
  useIsoLayoutEffect(() => {
    landed.current?.();
    landed.current = null;
  }, [pathname]);

  useEffect(() => {
    if (typeof document.startViewTransition !== "function") return undefined;
    const original = { push: router.push, replace: router.replace };

    const through = (navigate) => (href, options) => {
      let crossFade = false;
      try {
        const target = new URL(String(href), window.location.href);
        crossFade = target.origin === window.location.origin
          && target.pathname !== window.location.pathname
          && document.visibilityState === "visible"
          && !prefersReducedMotion();
      } catch {
        crossFade = false;
      }
      if (!crossFade) return navigate(href, options);

      landed.current?.(); // a newer navigation supersedes one still waiting
      let navigated = false;
      const go = () => {
        if (navigated) return;
        navigated = true;
        navigate(href, options);
      };
      try {
        const transition = document.startViewTransition(() => new Promise((resolve) => {
          landed.current = resolve;
          setTimeout(resolve, HOLD_MS);
          go();
        }));
        // Skipped (superseded, tab hidden) is an outcome, not an error
        for (const settled of [transition.ready, transition.finished, transition.updateCallbackDone]) {
          settled?.catch?.(() => {});
        }
      } catch {
        go(); // the navigation itself must never depend on the fade
      }
      return undefined;
    };

    router.push = through(original.push);
    router.replace = through(original.replace);
    return () => {
      router.push = original.push;
      router.replace = original.replace;
    };
  }, [router]);

  return null;
}
