"use client";

// SourceTag — keeps a ?ref=<tag> from any page, and puts it on a new account
// that didn't sign up through the form (src/lib/sourceTag.js has the rules).
// Mounted once in the root layout; renders nothing. Runs on every page change
// (a client navigation keeps the layout mounted), and asks nothing of the
// network unless a tag is waiting on this device and someone is signed in.
// Fire-and-forget: the page never waits on it and never hears of a failure.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { readStoredRef, refFromSearch, rememberRef, tagAccount } from "@/lib/sourceTag";

export default function SourceTag() {
  const pathname = usePathname();
  useEffect(() => {
    let storage;
    try {
      storage = window.localStorage;
    } catch {
      return;
    }
    rememberRef(storage, refFromSearch(window.location.search));
    if (!readStoredRef(storage)) return;
    // The Supabase client loads only here, so a page that has no other use
    // for it (the legal pages) ships none of it on a plain visit
    import("@/lib/supabase")
      .then(({ createClient }) => tagAccount({ supabase: createClient(), storage }))
      .catch(() => {});
  }, [pathname]);
  return null;
}
