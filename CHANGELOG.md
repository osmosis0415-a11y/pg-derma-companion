# What's new in PG Derma Companion

Updates install automatically: when a new version is deployed, the app shows **"✨ New version available — tap to update"**.

## 2026-11-26 — Bots switched on, bot script secured
- The bots are live. They check every 15 minutes and make at most one post per check, so a run never hits Google's 6-minute limit. A bot never posts twice in one day.
- The admin bot script in the repo now matches the one running in Google Apps Script, including the owner-only guard (only the admin or the script's own schedule can run its functions — not visitors to its web link). This fix had been live since 20 Nov but was never merged.

## 2026-11-26 — Community bots (clearly labelled)
- **Four AI bot accounts keep the Community lively.** Each name ends in "Bot", each post and reply carries a **BOT** badge, and every post ends with an "AI-generated — verify with your faculty" line. Bot profiles say "Automated account".
  - **Case of the Day Bot** — 9 am: a teaching case (no real patients) asking for your diagnosis. The answer with clues and first-line management appears in the thread that evening.
  - **Basics & SOP Bot** — 1 pm: a basics lesson or a step-by-step procedure SOP (KOH mount, Tzanck, slit-skin smear, punch biopsy, peels, cryotherapy, patch testing and more), with its source. It also answers a resident's Question if nobody has replied within an hour.
  - **Thesis Coach Bot** — 6 pm on Mon/Wed/Fri: one research-method tip (PICO, sample size, CTRI, consent, statistics). It never writes thesis text or invents data.
  - **Journal Club Bot** — 8 pm: opens a discussion on a real paper from the live Journal digest, with the link.
- Bots post automatically. **Admin → Bots** switches each one, or all of them, on or off. Any bot post can be deleted from its ⋯ menu.
- Setup: paste the latest `tools/admin-bot.gs` into the admin bot script and run `setupBots()` once (it uses the same free Gemini key as the study bot). Done on 26 Nov.

## 2026-11-26 — Admin can deploy new designs
- **Admin console → Designs:** pick the look for everyone, preview it on your own phone first, then deploy. A deploy history lets you roll back in one tap.
  - **Home screen:** Classic (teal hero), **Bento** (light bento grid — a case/study carousel, daily goal, streak, quick quiz and what's due) or **Bento Glass** (the same grid on dark frosted glass).
  - **Community feed:** X-style timeline or Instagram feed (the old quick switch is still on the Pending tab).
  - **Study feed:** Classic swipe feed or the new **Micro-learning deck** — obsidian cards, monospace topic pills, indigo and emerald accents, and a compact thumb rail at the bottom right.
- "Preview on this phone" changes only the admin's own phone; residents keep seeing what is live until you press **Deploy to everyone**.

## 2026-11-26 — Score and dose accuracy fixes
- **SALT (alopecia areata) grading corrected.** The band under the score now shows the standard subclass — S0 none, S1 <25%, S2 25–49%, S3 50–74%, S4a 75–95%, S4b 96–99%, S5 100% (Olsen 2004) — together with the 2022 severity grade (limited ≤20%, moderate 21–49%, severe ≥50%). Before, a 22% loss was shown as "S2", and 0% as "S1".
- **Isotretinoin calculator:** the current dose now shows two decimals, so low-dose regimens read correctly (15 mg/day at 60 kg = 0.25 mg/kg/day, not 0.3).
- **SCORAD and SALT:** a negative or over-100% entry by mistake can no longer push the score below 0 or above the maximum.

## 2026-11-20 — Journal digest
- **New: Journal digest** (Home card, Profile → Journal, and mixed into the swipe Feed). New dermatology papers — reviews, trials, meta-analyses and guidelines from JAAD, BJD, JAMA Dermatology, JEADV, IJDVL, IDOJ and more — summarised for residents: headline, short summary, key points, and "what it means for you", with a link to the paper.
- **Pictures with credit:** a figure from the paper only when the paper is open access under a Creative Commons licence; otherwise an openly licensed illustrative image, or none. Every picture shows its credit and licence.
- Save posts, filter by topic, share to WhatsApp. Read posts stop showing as "new". Works offline once loaded.
- **Admin console → Journal digest:** the bot drafts papers every morning; review, edit, publish now or schedule. Add any paper by PMID or DOI and the bot writes it within a minute or two, or write a post yourself with your own picture. Optional auto-publish and papers-per-day setting.

## 2026-11-20 — Website look in the app; PIN-only login on a new phone
- **The app now looks like the website:**
  - Teal hero on Today with your greeting, what's due and your study streak, plus a coral "Scroll the feed" button.
  - Gradient icon tiles, rounder cards, bolder headings, a blurred top bar and gentle fade-in animations on every screen.
  - The Study hub's streak card is now a teal hero too.
- **One Gmail = one account.** Signing in with the same Google account anywhere always opens the same account; nobody can create a second one with that email.
- **New phone? Just your PIN.** If your encrypted backup is on in Google Drive, a new phone shows "Welcome back, Dr. Name — enter your PIN". Your data comes back, with no new account and no new PIN. "Start fresh" is still there if you want an empty phone.
- **Backup reminder on Today:** "Log in on any phone with just your PIN — Turn on backup" (one tap, or Later).

## 2026-11-20 — Public website
- **Landing page:** https://osmosis0415-a11y.github.io/pg-derma-companion/site/ — designed in Canva, built as a fast real page.
  - Teal hero, real app screenshots, features, how it works, privacy and invite sections.
  - **Join PG Derma** buttons open the app sign-up.
- Invite links now open this page first, so friends see what PG Derma is, and the referral code still carries through to sign-up.

## 2026-11-20 — Find people, Twitter/X look by default
- **Find people:** a 🔍 search icon on Community (and a search bar on Explore). Search residents by name, college or level, with "Suggested for you" (your college first, then the most active) and Follow buttons in the list.
- **Every resident gets a public profile** as soon as they sign in, so everyone can find, view, follow and message each other.
- **Followers / Following lists:** tap the counts on any profile.
- **Twitter / X look is now the default:** compact timeline with @handles, X-style tabs, a "What's happening in your OPD?" composer and a floating ＋ post button. The admin can still switch to Instagram style.
- "Show me on the leaderboard" off now only hides you from the leaderboard; your profile stays visible.

## 2026-11-20 — New sign-up, log-in and invites
- **Welcome screen:** an animated brand background, a swipeable tour of the app (Swipe to learn, Community, Logbook, Streaks), and separate **Create account** and **Log in with Google** buttons. Still no passwords.
- **Sign-up details:** name, college and level (JR1/JR2/JR3, Senior resident, Faculty, PG aspirant), an optional referral code, and the community rules to accept.
- **Live approval tracker:** steps from Google to Details, Approval and Ready. The app opens by itself the moment you're approved, and there's an Ask-the-admin-on-WhatsApp button.
- **Invites and referrals:** everyone has an invite code and link (Profile → Invite batchmates). Opening someone's link fills in their code at sign-up. When the admin approves the new person, the inviter gets a "joined with your invite 🎉" notification.
- **Admin** sees each request's college, level and who referred them, in the app and in the admin console.
- **PIN screen** redesigned: "Welcome back, Dr. Name", PIN dots that fill as you type, and a shake on a wrong PIN. Your sign-up name and college carry into the app.

## 2026-11-20 — Follow, messages, notifications, profile photos, story polls & quizzes
- **Profile photos:** tap your avatar on your profile to add one. It shows on posts, comments, stories, messages and the leaderboard.
- **Follow / followers:** follow anyone from their profile, see follower and following counts, and use the new **Following** feed filter.
- **Messages (DMs):** private 1:1 chats from any profile (Message button), with unread counts. Inbox is the paper-plane icon on Community.
- **Notifications page** (heart icon on Community): likes, comments, new followers, messages, missed calls and story answers, with a red badge.
- **Your story:** share a photo, text, **poll** or **quiz** for 24 hours from "Your story" (the + circle). Batchmates vote and see live results; quizzes show right or wrong.
- **Admin: app style switch.** Admin → App style lets you choose **Instagram style** or **Twitter / X style** (compact text timeline) for everyone. It's also in the admin console.
- **Push notifications:** built in, switching on once the web push key is added.

## 2026-11-20 — Community, new brand, admin console, admin calls
- **New look:** a teal-to-coral brand, a new logo (a dermoscope lens over skin layers), new app icons, gradient story rings and gold streak flames.
- **Community tab** (bottom bar) for every approved resident, no batch needed:
  - Post cases, questions and pearls, with a de-identified photo if you want.
  - Like (double-tap works), comment, share and report.
  - **Stories** of anyone who posted in the last 48 hours.
  - **Explore** grid that mixes peer cases with study cards.
  - **Leaderboard** for this week, all time and streaks, plus public **profiles** with a photo grid and badges.
- **"For you" ranking:** the app learns from what you spend time on, like, save, comment on and get wrong, and puts those topics first. Your Feed now mixes in peer cases. All of this is worked out on your phone.
- **Discuss** button on every Feed card.
- **Admin console:** a separate page at /admin.html. Sign in with the admin Google account, no PIN needed. Overview, users, study content, reports, posts, batches, study reminders, errors and links.
- **Admin can call anyone** (voice or video) from Users, no batch needed. Residents with calling switched on can call each other from profiles.
- The batch is optional; everything except batch chat and calendar works without one.

## 2026-11-19 — Study: daily streak, swipe feed and content bot
- **New Study tab** (bottom bar). It comes with 154 dermatology PG items written from standard texts: 42 MCQs with explanations, 42 flashcards, 20 spot-diagnosis vignettes and 50 high-yield one-liners, across 20 topics.
- **Feed**: an endless full-screen swipe-up feed, like Reels but all dermatology. Answer MCQs inline, tap to reveal flashcards and diagnoses, double-tap to save, share to WhatsApp, and see a checkpoint every 15 cards.
- **Streak and daily goal** (5/10/20/30 a day): a flame counter, a 7-day row and a celebration when you hit the goal. It shows on the Today screen too.
- **Flashcards use spaced repetition**: Again, Hard, Good or Easy decides when a card comes back.
- **Mistakes** and **Saved** lists for revision; topic-wise progress.
- **Daily reminder**: an optional email at your chosen time, sent only on days you haven't studied, plus a one-tap Google Calendar reminder.
- **Content bot**: every morning it drafts new items with free Gemini AI on a rotating topic and emails the admin to Publish or Discard each one. The admin can also edit them in Admin → Content. Nothing reaches residents until approved.
- Bottom bar: Today · Patients · Study · Batch · Profile. New case stays first in Today's quick actions.

## 2026-11-19 — Today dashboard and group calls
- **New home: Today.** Opens with what's due today (follow-ups, thesis visits, reports to trace, overdue in red), your logbook and thesis progress bars, six quick actions, your batch (who's online, new messages) and your four latest cases.
- Bottom bar is now Today · Patients · Add case · Batch · Profile. Photos moved to quick actions and Profile.
- **Group calls (up to 4, voice or video).** Batch hub → Members → Group call: pick up to 3 online batchmates. They get a ringing screen and join with voice or video. Same rules as 1:1 calls: only people the admin switched calling on for can start or join, and nothing is recorded. Uses the same free relay.
- Deleting a batch also deletes its group-call rooms.

## 19 Nov 2026 (familiar layout)
- **Layout people already know:** a quick-access row of circles at the top of Home (New case, Follow-ups, Thesis, Reports, Logbook, Photos, Formulary, and batchmates online), then **Recent cases** with each case's photo, scores and quick actions.
- **Profile tab** replaces "More": your counts (patients, photos, procedures), Edit profile, circles for every tool, and a grid of your clinical photos.
- The top bar has a 🔔 for due reminders and 💬 for batch discussion, each with a count. The bottom bar is Home · Patients · Add case · Photos · Profile.
- Kept clean and clinical: one teal accent, no social-media styling.
- **Calls:** fixed a timing issue that could stop a call from connecting on the receiver's side. Call problems now show up in Admin → Errors.

## 19 Nov 2026 (calls)
- **1:1 voice & video calls** between batchmates: Batch hub → Members. A green dot shows who has the app open; tap 📞 or 🎥 to call. The call screen has ringing, answer (voice or video), mute, camera on/off, switch camera and a timer.
- **Calling is off by default.** The admin switches it on per person in Access requests → Approved ("Calls on/off"), and the database rules enforce it.
- Calls go phone-to-phone; across blocked networks they relay through ExpressTURN's free tier (1 TB a month, no card). Nothing is recorded or stored.
- The app won't auto-lock in the middle of a call.

## 19 Nov 2026 (fix)
- **Fixed: "Delete batch" did nothing** in some browsers and installed apps. The browser's pop-up box was blocked. All confirmations (delete, clear chat, PIN change, erase, remove member…) now use the app's own dialog, which works everywhere.

## 19 Nov 2026 (admin tools)
- **Admin → Access requests → Batches:** see every batch with its members and message count. Remove members, clear a batch's chat, or delete the whole batch (chat, calendar, shared counts and members). You must type DELETE to confirm.
- **Batch creators** can clear the chat or delete their batch from Batch hub → Members.
- The app admin can delete any chat message or event inside a batch.
- **Rejected requests** now have a Remove button to clear old records.

## 19 Nov 2026 (batch chat)
- **Batch group chat:** Batch hub → **Chat**. Message your whole batch inside the app. Unread messages show as a red count on the Chat tab. Delete your own messages; the batch admin can delete any.
- A reminder sits above the chat, and you're asked to confirm before sending anything that looks like a UHID, OPD number or phone number.

## 19 Nov 2026 (new look)
- **Cleaner, more professional design** (from the Canva "UI v3" mockup): white cards with thin borders, one teal accent, quieter chips and tags, and outline icons instead of emoji in the menus, tiles and sign-in screen.
- Dark mode updated to match.

## 19 Nov 2026 (admin bot, Drive stays connected, error reports)
- **Google Drive stays connected.** No more "reconnect" bar every hour; the app renews access silently in the background.
- **Sign-in fixed for the installed app** (home-screen icon): Google sign-in now uses a popup that works inside installed apps.
- **Approval bot for the admin:** an email (optionally Telegram) arrives for every new sign-up, with one-tap Approve / Reject.
- **Error reports:** if something breaks, a short, scrubbed report (no names, emails, UHIDs or notes) reaches the admin under More → Access requests → Errors.

## 19 Nov 2026 (Google sign-in & approval)
- **Sign in with Google** is now required to open the app. New accounts wait for **approval by the admin (Dr. Sriram)**; the screen unlocks automatically once approved. There's a button to ask for approval on WhatsApp.
- Admin: **More → Access requests** to approve, reject or revoke. Revoked accounts are locked out the next time the app goes online.
- Once approved, the app still works offline. Google Drive sync uses the same Google account.
- Fixed: the very first visit could reload the page once while the offline cache installed.

## 19 Nov 2026 (Google Drive)
- **Cloud sync now uses your own Google Drive.** Settings → Cloud sync → **Connect Google Drive**. Records and photos are saved, encrypted with your PIN, in a hidden PG Derma folder in *your* Drive (your own 15 GB, not a shared limit). The app can't see any of your other Drive files.
- **Restore from Google Drive** on a new phone from the first screen.
- If Google's 1-hour access expires, a blue **"Tap to reconnect Google Drive"** bar appears — one tap and syncing continues.
- The email/password login is now only for the Batch hub.

## 19 Nov 2026 (accounts)
- **Email verification:** new email accounts get a verification link; Cloud sync and the Batch hub unlock once it's clicked (Google accounts are verified automatically).
- **Account section** in Settings: sign out, change password, and delete your account and cloud data (data on your phone is never touched).

## 19 Nov 2026 (later)
- **Email sign-in for Cloud sync:** create an account, sign in or reset your password with email, right in Settings → Cloud sync (Google sign-in still works).

## 19 Nov 2026
- **Cloud sync (end-to-end encrypted):** patients, visits, scores, logbook, thesis data and photos stay in sync across your phone, iPad and laptop. Everything is encrypted with your PIN before upload. (Settings → Cloud sync)
- **Restore on a new phone:** "Restore from cloud" on the first screen.
- **Refresh no longer locks the app.** It stays unlocked until your auto-lock time (default 15 min; change it in Settings).
- **Over-the-air updates** with an in-app update bar.
- **Batch hub (Firebase):** shared batch calendar and anonymous logbook comparison with your batchmates.
- Fixed: PIN field not accepting typing; Enter key reloading Quick add; WhatsApp templates losing placeholders.
- New: UHID barcode/QR scan (Android), memory-safe encrypted backups, Android notifications, correlation reminders for traced reports.

## 19 Nov 2026 — v1.0
- First release: OPD quick-add, encrypted photo vault with ghost overlay, compare and Conference-mode de-identification, body/face/mucosa/nerve mapper, PASI/EASI/SCORAD/SALT/MASI/VASI/GAGS/DLQI, investigations board, NMC logbook export, thesis CRF builder with SPSS export, formulary and calculators, OT checklists, analytics.
