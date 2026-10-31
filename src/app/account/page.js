"use client";

// /account — Account (The House List §8.8). Phase 2 shipped the header and
// Sign out (moved here from home's header); Phase 6 builds out the rest:
//
//   I. You           Name (edited in place → user_metadata.name), Email,
//                    Password → the reset-link email ForgotPasswordForm sends
//   II. At the table Currency, Usual spend and Color — saved to
//                    wine_profiles.preferences (D8), which pre-fill Tonight's
//                    terms on Match. Only with a profile to save them to; a
//                    failed read says so rather than show "Not set" on a guess
//                    (a guessed state saved back would clobber the real one).
//   III. Your data   Export your journal (CSV, built here — journalExport.js),
//                    Adjust quiz answers, Start fresh (StartFreshConfirm, D2)
//   Sign out · Delete account (asks in place, then POST /api/account/delete)
//
// No Notifications section until the email provider is decided (D7).

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_ERRORS, AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import { NAME_MAX, cleanName } from "@/lib/authFlow";
import { COLORS, preferencesWith, spendFromAmounts, termsFromPreferences } from "@/lib/matchTerms";
import { colorTerm, usualSpendLine } from "@/lib/houseCopy";
import { JOURNAL_CSV_COLUMNS, journalCsv, journalCsvFilename } from "@/lib/journalExport";
import { numeralCounter } from "@/lib/numerals";
import PalateMark from "@/components/PalateMark";
import RunningHead from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Divider from "@/components/house/Divider";
import SectionHead from "@/components/house/SectionHead";
import SettingRow from "@/components/house/SettingRow";
import RuledField, { AmountRange } from "@/components/house/RuledField";
import { ChoiceOptions } from "@/components/house/ChoiceLine";
import ConfirmBlock, { StartFreshConfirm } from "@/components/house/ConfirmBlock";
import Toast, { useToast } from "@/components/house/Toast";
import EmptyState from "@/components/house/EmptyState";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, ink } from "@/components/house/tokens";

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `24px ${GUTTER}px 48px` };
const sectionHead = { margin: "30px 0 2px" };
const alertLine = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.55, color: BURGUNDY, marginTop: 8,
};
const quietLine = { fontFamily: SANS, fontSize: "13px", lineHeight: 1.5, color: ink(0.55), padding: "14px 0" };

const SAVE_FAILED = "Couldn’t save — please try again.";
const EXPORT_FAILED = "We couldn’t export your journal just now — try again in a moment.";
const EXPORTED = "✓ Journal exported — check your downloads";
const DELETE_COPY = "Delete your account? This removes your palate, your journal and every bottle you’ve rated — for good.";

const COLOR_LABELS = { all: "All", red: "Red", white: "White", sparkling: "Sparkling" };
const COLOR_CHOICES = COLORS.map((id) => ({ id, label: COLOR_LABELS[id], testId: `account-color-${id}` }));

// Every sommeasy.* key this device kept for the account — the pending
// palate, dismissals, recent searches, the back trail
function clearDeviceKeys() {
  for (const pick of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = pick();
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith("sommeasy.")) keys.push(key);
      }
      keys.forEach((key) => store.removeItem(key));
    } catch {
      // Storage can be off (private mode); nothing kept there to clear
    }
  }
}

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [genome, setGenome] = useState(null);
  // "ok" (a profile row) | "none" (no profile yet) | "failed" (couldn't read)
  const [profileState, setProfileState] = useState("ok");
  const [prefs, setPrefs] = useState({});
  const [prefsError, setPrefsError] = useState("");
  // Which inline editor is open: null | "name" | "spend" | "color"
  const [editing, setEditing] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [spendDraft, setSpendDraft] = useState({ min: "", max: "" });
  const [resetSending, setResetSending] = useState(false);
  const [resetError, setResetError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [confirmingFresh, setConfirmingFresh] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const { toasts, showToast } = useToast();
  const colorLabelId = useId();
  const nameRow = useRef(null);
  const nameCommitted = useRef(false);
  const spendBox = useRef(null);
  const freshTrigger = useRef(null);
  const deleteTrigger = useRef(null);
  // What the profile is KNOWN to hold — moved only by a confirmed write —
  // and the latest asked-for state; writes go one at a time, each sending
  // the latest, so the last one standing is what the user last chose
  const prefsSaved = useRef({});
  const prefsWanted = useRef({});
  const prefsChain = useRef(Promise.resolve());
  const supabase = createClient();

  useEffect(() => {
    let live = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      if (!live) return;
      setUser(u);
      if (u) {
        const { data, error } = await supabase
          .from("wine_profiles").select("identity, preferences").eq("user_id", u.id).maybeSingle();
        if (!live) return;
        if (error) {
          setProfileState("failed");
        } else if (!data) {
          setProfileState("none");
        } else {
          const saved = preferencesWith(data.preferences, {});
          prefsSaved.current = saved;
          prefsWanted.current = saved;
          setPrefs(saved);
          setGenome(data.identity?.genome ?? null);
        }
      }
      setLoading(false);
    }
    init();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The amount pair opens with its first field ready
  useEffect(() => {
    if (editing === "spend") spendBox.current?.querySelector("input")?.focus();
  }, [editing]);

  // ─── I. You ───
  const savedName = cleanName(user?.user_metadata?.name);

  const openName = () => {
    setNameError("");
    if (editing === "name") return closeName();
    nameCommitted.current = false;
    setNameDraft(savedName);
    setEditing("name");
  };
  const closeName = () => {
    setEditing(null);
    nameRow.current?.focus();
  };
  // Enter or blur saves (once); a cleared field keeps the name it had
  const commitName = async () => {
    if (nameCommitted.current) return;
    nameCommitted.current = true;
    const next = cleanName(nameDraft);
    closeName();
    if (!next || next === savedName) return;
    setNameSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { name: next } });
      if (error) setNameError(authErrorCopy(mapAuthError(error)));
      else if (data?.user) setUser(data.user);
    } catch {
      setNameError(authErrorCopy("network"));
    }
    setNameSaving(false);
  };

  const sendResetLink = async () => {
    if (resetSending || !user?.email) return;
    setResetSending(true);
    setResetError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        // The confirm/callback layer sets the recovery session, then
        // forwards to /update-password — the same link Forgot sends
        redirectTo: `${window.location.origin}/api/auth/callback?next=/update-password`,
      });
      if (error) setResetError(authErrorCopy(mapAuthError(error)));
      else showToast(AUTH_MESSAGES.reset_link_toast);
    } catch {
      setResetError(authErrorCopy("network"));
    }
    setResetSending(false);
  };

  // ─── II. At the table ───
  const persistPrefs = () => {
    prefsChain.current = prefsChain.current.then(async () => {
      const wanted = prefsWanted.current;
      if (wanted === prefsSaved.current) return;
      const { error } = await supabase.from("wine_profiles").update({ preferences: wanted }).eq("user_id", user.id);
      if (error) throw error;
      prefsSaved.current = wanted;
    }).catch((err) => {
      console.error("Preferences save failed:", err);
      prefsWanted.current = prefsSaved.current;
      setPrefs(prefsSaved.current);
      setPrefsError(SAVE_FAILED);
    });
  };
  const changePrefs = (change) => {
    const next = preferencesWith(prefsWanted.current, change);
    if (JSON.stringify(next) === JSON.stringify(prefsWanted.current)) return;
    prefsWanted.current = next;
    setPrefs(next);
    setPrefsError("");
    persistPrefs();
  };

  const toggleEditor = (which) => {
    setPrefsError("");
    if (which === "spend" && editing !== "spend") {
      const terms = termsFromPreferences(prefsWanted.current);
      setSpendDraft({ min: terms.min, max: terms.max });
    }
    setEditing((open) => (open === which ? null : which));
  };
  // The pair saves as focus leaves it (README: on blur)
  const saveSpend = () => changePrefs({ spend: spendFromAmounts(spendDraft.min, spendDraft.max) });

  // ─── III. Your data ───
  const exportJournal = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    let rows = null;
    try {
      const { data, error } = await supabase
        .from("wine_interactions")
        .select(JOURNAL_CSV_COLUMNS.join(", "))
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (!error && Array.isArray(data)) rows = data;
    } catch {
      rows = null;
    }
    setExporting(false);
    // Unknown ≠ empty: a failed read never downloads an empty journal
    if (!rows) {
      setExportError(EXPORT_FAILED);
      return;
    }
    downloadText(journalCsv(rows), journalCsvFilename());
    showToast(EXPORTED);
  };

  // ─── Sign out · Delete account ───
  // "✓ Signed out" has to be true: when the logout call fails, supabase-js
  // keeps the session — so say so and stay, never land on a false notice
  const signOut = async () => {
    setSigningOut(true);
    setSignOutFailed(false);
    let error = null;
    try {
      ({ error } = await supabase.auth.signOut());
    } catch (err) {
      error = err;
    }
    if (error) {
      console.error("Sign out failed:", error);
      setSignOutFailed(true);
      setSigningOut(false);
      return;
    }
    router.replace("/login?notice=signed_out");
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    let ok = false;
    try {
      // JSON on purpose: a cross-site form can't send it without a preflight
      const res = await fetch("/api/account/delete", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setDeleting(false);
      setDeleteError(AUTH_ERRORS.account_delete_failed);
      return;
    }
    // The account is gone and the route cleared the cookie session; sign
    // out here too (a deleted user's logout may fail — the session goes
    // either way), then forget this device's keys
    try {
      await supabase.auth.signOut();
    } catch {
      // Nothing left to sign out of
    }
    clearDeviceKeys();
    router.replace("/?notice=account_deleted");
  };

  const keepAccount = () => {
    setConfirmingDelete(false);
    setDeleteError("");
    deleteTrigger.current?.focus();
  };
  const keepQuiz = () => {
    setConfirmingFresh(false);
    freshTrigger.current?.focus();
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
      </div>
    );
  }

  if (!user) {
    return (
      <main style={column}>
        <EmptyState
          emoji="🍷"
          title="Sign in to see your account"
          sub="Your palate, your journal and every bottle you’ve rated live here."
          action="Sign in"
          href="/login?next=%2Faccount"
        />
      </main>
    );
  }

  const name = savedName || (user.email || "").split("@")[0];
  const joined = user.created_at ? new Date(user.created_at) : null;
  const memberSince = joined && !Number.isNaN(joined.getTime())
    ? joined.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;
  const hasProfile = profileState === "ok";
  const busy = deleting || signingOut;
  const next = numeralCounter();

  return (
    <>
      <RunningHead />
      <main style={column}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PalateMark genome={genome} size={60} />
          </div>
          <h1 data-testid="account-name-heading" style={{
            fontFamily: SERIF, fontSize: "28px", fontWeight: 700, lineHeight: 1.15,
            letterSpacing: "-0.01em", color: INK, marginTop: 12, overflowWrap: "anywhere",
          }}>{name}</h1>
          {memberSince && (
            <div style={{
              fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.2em",
              textTransform: "uppercase", color: ink(0.45), marginTop: 6,
            }}>Member since {memberSince}</div>
          )}
        </div>

        {/* ─── I. You ─── */}
        <section>
          <SectionHead numeral={next()} label="You" style={sectionHead} />
          <SettingRow
            ref={nameRow}
            label="Name"
            value={nameSaving ? "Saving…" : savedName || "Add your name"}
            onClick={openName}
            expanded={editing === "name"}
            disabled={nameSaving}
            testId="account-name"
          >
            {editing === "name" && (
              <RuledField
                variant="sans"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    commitName();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    nameCommitted.current = true;
                    closeName();
                  }
                }}
                maxLength={NAME_MAX}
                autoComplete="name"
                aria-label="Your name"
                placeholder="What the Somm should call you"
                data-testid="account-name-input"
                style={{ marginTop: 6 }}
              />
            )}
            {nameError && <p role="alert" style={alertLine}>{nameError}</p>}
          </SettingRow>
          <SettingRow label="Email" value={user.email} testId="account-email" />
          <SettingRow
            label="Password"
            value={resetSending ? "Sending…" : "Change"}
            onClick={sendResetLink}
            disabled={resetSending}
            testId="account-password"
          >
            {resetError && <p role="alert" style={alertLine}>{resetError}</p>}
          </SettingRow>
        </section>

        {/* ─── II. At the table ─── */}
        {profileState !== "none" && (
          <section>
            <SectionHead numeral={next()} label="At the table" style={sectionHead} />
            {hasProfile ? (
              <>
                <SettingRow label="Currency" value="USD $" />
                <SettingRow
                  label="Usual spend"
                  value={usualSpendLine(prefs.spend)}
                  onClick={() => toggleEditor("spend")}
                  expanded={editing === "spend"}
                  testId="account-spend"
                >
                  {editing === "spend" && (
                    <div
                      ref={spendBox}
                      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) saveSpend(); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          saveSpend();
                        }
                      }}
                    >
                      <AmountRange
                        style={{ marginTop: 10, justifyContent: "flex-end" }}
                        min={spendDraft.min}
                        max={spendDraft.max}
                        minLabel="Usual spend, from"
                        maxLabel="Usual spend, up to"
                        onMinChange={(min) => setSpendDraft((d) => ({ ...d, min }))}
                        onMaxChange={(max) => setSpendDraft((d) => ({ ...d, max }))}
                      />
                    </div>
                  )}
                </SettingRow>
                <SettingRow
                  label="Color"
                  value={colorTerm(prefs.color)}
                  onClick={() => toggleEditor("color")}
                  expanded={editing === "color"}
                  testId="account-color"
                >
                  {editing === "color" && (
                    <>
                      <span id={colorLabelId} hidden>Color</span>
                      <ChoiceOptions
                        options={COLOR_CHOICES}
                        value={termsFromPreferences(prefs).color}
                        onChange={(color) => changePrefs({ color })}
                        labelledBy={colorLabelId}
                        style={{ justifyContent: "flex-end", marginTop: 6 }}
                      />
                    </>
                  )}
                </SettingRow>
                {prefsError && <p role="alert" style={alertLine}>{prefsError}</p>}
              </>
            ) : (
              <p style={quietLine}>Your table settings didn’t load — give it a moment and try again.</p>
            )}
          </section>
        )}

        {/* ─── III. Your data ─── */}
        <section>
          <SectionHead numeral={next()} label="Your data" style={sectionHead} />
          <SettingRow
            label="Export your journal"
            value={exporting ? "Exporting…" : "CSV"}
            onClick={exportJournal}
            disabled={exporting}
            testId="account-export"
          >
            {exportError && <p role="alert" style={alertLine}>{exportError}</p>}
          </SettingRow>
          {profileState !== "none" && (
            <>
              <SettingRow label="Adjust quiz answers" href="/?quiz=refine" testId="account-refine" />
              <SettingRow
                ref={freshTrigger}
                label="Start fresh"
                onClick={() => setConfirmingFresh((open) => !open)}
                expanded={confirmingFresh}
                testId="start-fresh"
              />
              {confirmingFresh && <StartFreshConfirm onCancel={keepQuiz} style={{ marginTop: 12 }} />}
            </>
          )}
        </section>

        <Divider style={{ marginTop: 34 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 }}>
          <button
            type="button"
            data-testid="account-signout"
            onClick={signOut}
            disabled={busy}
            style={{
              padding: "12px 0", border: "none", background: "none",
              fontFamily: SERIF, fontSize: "18px", fontWeight: 600, color: BURGUNDY,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
            }}
          >{signingOut ? "Signing out…" : "Sign out"}</button>
          {signOutFailed && (
            <p role="alert" data-testid="account-signout-error" style={{ ...alertLine, textAlign: "center", marginTop: 4 }}>
              {authErrorCopy("sign_out_failed")}
            </p>
          )}
          <button
            ref={deleteTrigger}
            type="button"
            data-testid="account-delete"
            onClick={() => {
              setDeleteError("");
              setConfirmingDelete((open) => !open);
            }}
            disabled={busy}
            aria-expanded={confirmingDelete}
            style={{
              padding: "8px 0", border: "none", background: "none",
              fontFamily: SANS, fontSize: "12px", color: INK, opacity: busy ? 0.3 : 0.45,
              cursor: busy ? "default" : "pointer",
            }}
          >Delete account</button>
          {confirmingDelete && (
            <ConfirmBlock
              testId="account-delete-confirm"
              copy={DELETE_COPY}
              confirmLabel="Delete everything"
              onConfirm={deleteAccount}
              pending={deleting}
              pendingLabel="Deleting…"
              cancelLabel="Keep my account"
              onCancel={keepAccount}
              error={deleteError}
              centered
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </main>
      <Toast toasts={toasts} aboveServiceBar />
      <ServiceBar />
    </>
  );
}
