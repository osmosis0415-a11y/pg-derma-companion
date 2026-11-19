# PG Derma Companion — Flutter (Android / iOS / iPadOS)

A native version of the web app, with the same data model and scoring engines. It adds things a browser can't do well:
**SQLCipher-encrypted database**, **FaceID / fingerprint unlock** (key held in iOS Keychain / Android Keystore),
**on-device ML Kit OCR** for OPD slips, **automatic face eye-bars** for Conference mode, and a native camera with a ghost overlay.

> The web app at https://osmosis0415-a11y.github.io/pg-derma-companion/ is the complete, tested product you can use today.
> This Flutter project is a starter codebase covering the core modules. It was written without a Flutter SDK in the build
> environment, so run the steps below and expect to fix a few compile-time details the first time.

## Set up

```bash
cd flutter
flutter create . --org com.pgderma --platforms android,ios   # generates android/ and ios/ folders around lib/
flutter pub get
dart run build_runner build --delete-conflicting-outputs     # generates lib/data/database.g.dart (Drift)
flutter test                                                  # scoring-engine unit tests
flutter run
```

### Platform permissions

**iOS** `ios/Runner/Info.plist`:
```xml
<key>NSCameraUsageDescription</key><string>Clinical photos are stored only in the encrypted in-app vault.</string>
<key>NSFaceIDUsageDescription</key><string>Unlock your encrypted patient vault.</string>
<key>NSMicrophoneUsageDescription</key><string>Voice-to-text for clinical notes.</string>
<key>NSSpeechRecognitionUsageDescription</key><string>Voice-to-text for clinical notes.</string>
```

**Android** `android/app/src/main/AndroidManifest.xml`: add `CAMERA`, `RECORD_AUDIO` and `USE_BIOMETRIC` permissions,
change `MainActivity` to extend `FlutterFragmentActivity` (needed by `local_auth`), and set `minSdkVersion 23`.

## Structure

```
lib/
  main.dart                     biometric LockGate → AppScope (db + vault) → AppShell
  data/database.dart            Drift tables: patients, visits, scores, media, pins, investigations,
                                reminders, NMC logbook, thesis config, CRF values, adverse events
  services/key_service.dart     256-bit master key in Keychain/Keystore + biometric auth
  services/photo_vault.dart     AES-256-GCM encrypted, EXIF-stripped photos in the app sandbox
  services/ml_services.dart     ML Kit slip OCR + face eye-bar de-identification
  services/export_service.dart  NMC logbook Excel/PDF, SPSS-ready thesis Excel with data dictionary
  scoring/scores.dart           PASI, EASI, SCORAD, SALT, MASI/mMASI, VASI, GAGS, DLQI, isotretinoin, lignocaine
  ui/app_shell.dart             phone bottom-nav / tablet navigation-rail
  ui/screens/                   home, quick capture (+OCR, voice), patients (master–detail), camera (ghost overlay),
                                score entry, logbook, thesis
test/scores_test.dart           same reference values as the web tests
```

The web app's WhatsApp templates, body maps, formulary, checklists, investigations board and batch hub are not yet
ported. `web/src/*.js` is the reference implementation for each.
