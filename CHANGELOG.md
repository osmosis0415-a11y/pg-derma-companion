# What's new in PG Derma Companion

Updates install automatically: when a new version is deployed, the app shows **"✨ New version available — tap to update"**.

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
