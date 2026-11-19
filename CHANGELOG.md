# What's new in PG Derma Companion

Updates install automatically: when a new version is deployed, the app shows **"✨ New version available — tap to update"**.

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
