// legalCopy.js — the Privacy Policy and Terms, as data (launch prep, Nov 2026).
//
// DRAFTS until Ed reviews them: LEGAL_DRAFT puts a "Draft for review" line
// on both pages. Flip it to false when they're approved, and set
// LEGAL_EFFECTIVE to that day. Change LEGAL_UPDATED whenever the text
// changes.
//
// Every factual claim here is written from what the code does; the launch
// readout (docs/launch-prep-readout.md) lists each one with the file that
// proves it. When the code changes what it collects or who it tells, change
// this file in the same commit.
//
// Inline tokens a paragraph may carry, rendered by LegalPage:
//   [[contact]] → the contact address (mailto)
//   [[privacy]] → the Privacy Policy   [[terms]] → the Terms   [[account]] → Account

export const LEGAL_DRAFT = false;
export const LEGAL_UPDATED = "November 23, 2026";
// The day the current text takes effect — set it to the day LEGAL_DRAFT
// goes false (while it's true, the draft line says "not yet in effect")
export const LEGAL_EFFECTIVE = "November 23, 2026";
// Who runs Sommeasy — "we" and "us" on both pages
export const LEGAL_OPERATOR = "Sommeasy is run by Ed Goodwin, an individual. “We” and “us” here mean him.";
// How long the weekly database backup is kept (retention-days in the PRIVATE
// repository epgoodwinjr/sommeasy-backups, .github/workflows/db-backup.yml)
export const BACKUP_RETENTION_DAYS = 90;
export const LEGAL_CONTACT = "hello@sommeasy.wine";

// Create account's line above its button. "Terms" and "Privacy Policy" are
// links; the words between are plain.
export const SIGNUP_CONSENT = {
  lead: "By creating an account you confirm you’re of legal drinking age where you live and agree to our ",
  terms: "Terms",
  and: " and ",
  privacy: "Privacy Policy",
  end: ".",
};

// Google makes a new account for a new address from either form, so no one
// gets one without seeing the line (launch prep Session 2b):
// - create account says it ONCE, above its button and so above Continue
//   with Google too, worded for both ways in (with the flag off it is
//   SIGNUP_CONSENT, word for word);
// - sign in puts GOOGLE_CONSENT right under Continue with Google, worded
//   for the button — there it may be an existing account.
export const SIGNUP_CONSENT_WITH_GOOGLE = {
  ...SIGNUP_CONSENT,
  lead: "By creating an account, here or with Google, you confirm you’re of legal drinking age where you live and agree to our ",
};
export const GOOGLE_CONSENT = {
  ...SIGNUP_CONSENT,
  lead: "By continuing with Google you confirm you’re of legal drinking age where you live and agree to our ",
};

export const PRIVACY = {
  title: "Privacy",
  sub: "What we keep, who helps us run Sommeasy, and what you can do about it.",
  sections: [
    {
      heading: "Who we are",
      body: [LEGAL_OPERATOR],
    },
    {
      heading: "The short version",
      body: [
        "We keep what you tell us about wine so we can recommend wine. We don’t sell it, we don’t show ads, and there are no third-party trackers or advertising cookies. You can export your journal or delete your account, and everything with it, from [[account]].",
        "Sommeasy is for people of legal drinking age where they live — 21 in the United States.",
      ],
    },
    {
      heading: "What we keep",
      list: [
        "Your account: your email address and the name you give us. Your password goes straight to our sign-in provider, Supabase, which stores it hashed; we never see it.",
        "If you continue with Google: the name and email address Google shares when you agree to it on Google’s screen.",
        "Your palate: your quiz answers (countries, regions, estates, grapes and any wines you name) and what we compose from them — your title, signature, narrative and palate mark.",
        "Your journal: the wines you rate, want or pass on, your verdicts, your notes, where you drank a bottle when you tell us, the Somm’s note for a pick you chose, and the direction you gave the Somm that night.",
        "Your settings at the table: your usual spend and color.",
        "A record of how you use Sommeasy: moments like finishing the quiz, analyzing a wine list, rating or choosing a wine. For a list, we keep counts (wines read, wines priced, picks shown) and tonight’s terms, not the list. When a list matches nothing, we keep up to 15 of the wine names it read, so we can see what went wrong. This record also notes what each of the Somm’s answers cost us to make.",
      ],
    },
    {
      heading: "Wine lists and labels",
      body: [
        "When you photograph a list, upload a file, paste a list or share a link, we send it to Anthropic, which reads it for us with its Claude models. Label photos are read the same way. We don’t store the photos, files or pasted text — only the wines read from them, while you use the page, and the counts above.",
        "When you share a link to a list, our server fetches that page for you, so the restaurant’s site sees our server, not you.",
      ],
    },
    {
      heading: "Who helps us run Sommeasy",
      body: ["We use a few providers, each for one job. They handle your data on our behalf:"],
      list: [
        "Supabase stores your account and everything above, and runs sign-in.",
        "Anthropic reads the lists and labels you send us. To write the Somm’s picks and notes, it also receives your palate (countries, regions, grapes and estates), the bottles you loved or didn’t, tonight’s terms and the wines on the list. To refresh the narrative on Your palate it receives your title, signature, palate and recent ratings. It never receives your name or email address.",
        "Resend delivers our sign-in emails: confirming your address, sign-in links and password resets.",
        "Google signs you in if you choose Continue with Google.",
        "Vercel hosts Sommeasy. Its Web Analytics counts page views without cookies and without identifying you.",
        "GitHub stores our weekly database backup. Each one is encrypted before it leaves the backup job, with a key only we hold, so GitHub can’t read it.",
      ],
    },
    {
      heading: "On your device",
      body: [
        "Sign-in keeps a session in cookies on your device. Sommeasy also remembers a few things in your browser’s own storage: a quiz you finished before creating an account (for up to seven days), your five most recent searches, prompts you dismissed, and the trail behind the back link. None of it leaves your device except the quiz, which joins your account when you sign up or sign in.",
        "To keep the service from being overwhelmed, our server remembers your IP address for up to one hour each time you use a feature that reads a list or label or asks the Somm, and counts the requests.",
        "Your browser may send a Do Not Track or Global Privacy Control signal. Sommeasy doesn’t read either one and works the same way with or without them, because there is nothing for them to switch off: we don’t track you across other sites, we have no advertising or third-party trackers, and our page counts set no cookies.",
      ],
    },
    {
      heading: "What we don’t do",
      list: [
        "We don’t sell or rent your data, and we don’t share it for advertising.",
        "We don’t show ads or use advertising or cross-site tracking cookies.",
        "We don’t ask for or track your location. “Where you drank it” is only what you type.",
        "We don’t make your palate public. Share your palate makes an image on your device with your title, signature and palate mark — no name or email — and it goes only where you send it.",
      ],
    },
    {
      heading: "Your choices",
      list: [
        "Change your name, your usual spend and your color in [[account]].",
        "Export your journal as a spreadsheet file from [[account]]. For a copy of everything else we keep, write to [[contact]].",
        "Remove any wine from your journal on its page; its pull on your palate goes with it.",
        "Start fresh resets your quiz answers.",
        "Delete account removes your account and everything tied to it — your palate, journal, history and usage record — from our database. It can’t be undone.",
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        `We keep your data while you have an account, and delete it when you delete your account. Once a week we make an encrypted backup of our database and keep each one for ${BACKUP_RETENTION_DAYS} days, so data you delete has left our backups within ${BACKUP_RETENTION_DAYS} days. Our providers may hold short-lived backups and logs on their own schedules.`,
      ],
    },
    {
      heading: "Changes and questions",
      body: [
        "If we change what we collect or who helps us, we’ll update this page and the date at the top. Questions, or a request about your data: [[contact]].",
      ],
    },
  ],
};

export const TERMS = {
  title: "Terms",
  sub: "The plain rules for using Sommeasy.",
  sections: [
    {
      heading: "Who we are",
      body: [`${LEGAL_OPERATOR} By using Sommeasy you agree to these Terms.`],
    },
    {
      heading: "Who can use Sommeasy",
      body: [
        "You must be of legal drinking age where you live — 21 in the United States — to create an account or use Sommeasy. By creating an account you confirm that you are.",
        "Your account is yours alone. Keep your password private, and tell us at [[contact]] if you think someone else has used it.",
      ],
    },
    {
      heading: "What Sommeasy is",
      body: [
        "Sommeasy suggests wines from a list you share, based on the taste you’ve told us about. Some of what you read — the Somm’s notes, your narrative — is written by an AI model and can be wrong. The restaurant’s own list, prices and staff have the final word.",
        "Sommeasy is free. We may change, add or remove features, or stop offering the service, and we’ll try to give notice of anything that affects your data.",
      ],
    },
    {
      heading: "Drink responsibly",
      body: [
        "Sommeasy is about enjoying wine, never about drinking more of it. Never drink and drive. Allergies, sulfites and health questions are for the restaurant and your doctor; we don’t know what’s in any bottle beyond what its list says.",
      ],
    },
    {
      heading: "Your content",
      body: [
        "Your ratings, notes and answers stay yours. You let us store and process them to run Sommeasy for you, including with the providers named in our [[privacy]].",
        "Share only lists and photos you’re free to share, and keep people’s faces and personal details out of them.",
      ],
    },
    {
      heading: "Fair use",
      list: [
        "Don’t try to break, overload or get around the limits of Sommeasy.",
        "Don’t use bots or scripts to sign up, scan lists or copy the service.",
        "Don’t use Sommeasy to harm anyone, or for anything unlawful.",
      ],
      after: ["We may suspend an account that does, and you can delete yours at any time from [[account]]."],
    },
    {
      heading: "The fine print",
      body: [
        "Sommeasy is provided as it is, without warranties of any kind. To the extent the law allows, we aren’t liable for indirect or consequential losses, or for a bottle you didn’t enjoy. Nothing here limits rights the law gives you that can’t be limited.",
        "These Terms are governed by the laws of the Commonwealth of Pennsylvania, without regard to its conflict-of-laws rules.",
        "If we change these Terms, we’ll update this page and the date at the top. Using Sommeasy after a change means you accept it.",
        "Questions: [[contact]].",
      ],
    },
  ],
};
