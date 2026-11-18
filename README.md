# PG Derma Companion

An offline-first, encrypted companion app for **MD Dermatology, Venereology & Leprosy (DVL)** residents in India. It's built for use between patients in OPD, on ward rounds and in the minor OT, with no hospital IT integration and no server.

**Live app:** https://osmosis0415-a11y.github.io/pg-derma-companion/

Open it on your phone and install it to the home screen (Android Chrome: ⋮ → *Install app*; iPhone/iPad Safari: Share → *Add to Home Screen*). After the first load it works fully offline.

## Privacy model

- All patient data and photos stay **on your device only**, in IndexedDB, encrypted with **AES-256-GCM**. The key is derived from your PIN with PBKDF2-SHA256 (310,000 iterations), and the PIN itself is never stored.
- Photos are taken inside the app and stored in the encrypted vault, so they never touch the phone gallery.
- The app makes no network calls with patient data. GitHub Pages only serves the code.
- Auto-lock after inactivity, and whenever the app is in the background longer than the timeout.
- **Encrypted backup** (`.pgbak`): save it to Google Drive, iCloud or email, and restore it on any device with the same PIN.
- There is no PIN recovery, so back up regularly. The home screen warns you after 7 days without a backup.

## Features

| Module | What's included |
|---|---|
| **1 · Pocket OPD tracker** | 30-second quick-add (UHID, age/sex, Fitzpatrick I–VI, pregnancy/lactation/G6PD flags, allergies, DVL diagnosis chips, voice-to-text notes), academic buckets (Thesis Case/Control, Rare/Case Report, Clinical Meet, Exam Spotter, Logbook), follow-up reminders with `.ics` export to the phone calendar, 1-tap **WhatsApp care cards** in English / हिन्दी / తెలుగు (8 templates, editable) via `wa.me`, so numbers are never saved to contacts |
| **2 · EMR, photo studio & logbook** | In-app camera with **ghost-overlay** alignment and a 3×3 grid; categories (Clinical, Dermoscopy, Trichoscopy, Wood's lamp, KOH, Tzanck, SSS, Histopath…); slider and side-by-side comparison with synchronised zoom/pan; tap-to-pin **body / face / scalp / oral / genital / palm-sole / peripheral-nerve** maps; **PASI, EASI, SCORAD, SALT, MASI, mMASI, VASI, VIDA, GAGS, DLQI** calculators with severity bands and % improvement from baseline; investigations Kanban (Sent → Traced → Correlated) with SSS BI/MI; **NMC logbook** with Performed/Assisted/Observed and auto JR1/JR2/JR3, exported to Excel and a printable PDF with signature columns |
| **Thesis** | CRF builder with presets (psoriasis, vitiligo, melasma, alopecia areata, acne, atopic dermatitis), auto-generated visit schedule with due/overdue alerts, custom variables, adverse-event logger (severity + WHO-UMC causality), dropout tracking, and a **one-click SPSS-ready Excel export** (wide format, numeric coding, data dictionary sheet, AE sheet) |
| **3 · Formulary & OT** | Searchable personal formulary with weight-based dosing (editable), isotretinoin cumulative-dose calculator, FTU guide (adult + paediatric) and tube calculator, compounding calculator (Kligman's, Whitfield's, salicylic acid, coal tar…), lignocaine maximum-dose calculator, 9 minor-OT tray checklists |
| **5 · Privacy & analytics** | PIN vault, **Conference mode** de-identification (eye bars, pixelate, black box, auto face detection where the browser supports it; re-encoding strips EXIF/GPS), logbook quota tracker, thesis recruitment gauge, case mix (Derm / Ven / Lep / Aesthetics), monthly visits |

| **Batch hub** (online, optional) | Firebase-backed: create or join your batch with a code, a **shared batch calendar** (seminars, journal clubs, postings, exams; weekly repeats; add to your phone calendar; share the week on WhatsApp) and **anonymous logbook comparison** (you vs batch average / median / top, per procedure and year). Only event details, display names and procedure *counts* are uploaded, never patient data |

Phone gets a bottom nav with a central ＋ button; iPad and tablet (≥900 px) get a sidebar and a two-pane patient list and detail view.

> ⚠️ The formulary is a personal quick reference. Verify every dose against current guidelines and the product label. The DLQI screen uses short item summaries for bedside use; for thesis data, use the official licensed DLQI form.

## Batch hub setup (one person per batch, ~5 minutes)

1. Go to https://console.firebase.google.com, choose **Add project** (Google Analytics is not needed).
2. **Build → Authentication → Get started.** Enable **Email/Password** and **Google**.
3. **Authentication → Settings → Authorised domains → Add domain:** `osmosis0415-a11y.github.io`
4. **Build → Firestore Database → Create database**, in production mode with location `asia-south1` (Mumbai). Open the **Rules** tab, paste [`firestore.rules`](firestore.rules) and publish.
5. **Project settings → Your apps → Web (</>)** → register the app, then copy the `firebaseConfig` object.
6. Paste it into [`web/src/firebase-config.js`](web/src/firebase-config.js) as `window.FIREBASE_CONFIG = {...}` and push. Everyone then gets the batch hub automatically. (Or paste it in the app under **More → Batch hub** to try it on one phone first.)
7. In the app: **Batch hub → sign in → Create batch**, then tap **Invite** to send the link and code on your batch WhatsApp group.

The free Spark plan is enough for a batch. The Firebase web config is public by design; access is enforced by the Firestore rules (members only, only your own counts, fixed field whitelist).

## Repository layout

```
web/src/        app source (plain JS, no dependencies)
web/build.py    bundles everything into dist/index.html + PWA files
web/test/       scoring-engine unit tests
flutter/        native Flutter (Android/iOS/iPadOS) version of the same app
.github/workflows/pages.yml   build → test → deploy to GitHub Pages on every push to main
```

### Develop locally

```bash
python3 web/build.py          # writes dist/
node web/test/scores.test.js  # unit tests
cd dist && python3 -m http.server 8000   # open http://localhost:8000
```

## Deployment

Every push to `main` runs the workflow and publishes `dist/` to GitHub Pages. You only need to do the one-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
