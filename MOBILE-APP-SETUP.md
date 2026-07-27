# Arsenal Predictor — iOS & Android App Setup

This turns the existing web app into real **App Store** and **Google Play** apps using
[Capacitor](https://capacitorjs.com). Capacitor wraps the same HTML/CSS/JS we already built
into native iOS and Android shells — no rewrite. Your web files stay the source of truth;
a `www/` folder is generated for the native build.

---

## What's already set up in this project

- `capacitor.config.json` — app id `com.pravdasoftware.arsenalpredictor`, name **Arsenal Predictor**, `webDir: "www"`.
- `manifest.json` + `sw.js` — makes the site an installable PWA (offline app shell) and provides the web layer Capacitor bundles.
- `scripts/copy-web.js` — copies the web files into `www/` (run via `npm run build:web`).
- `icons/` — PWA icons (192, 512, maskable).
- `resources/icon.png` (1024) + `resources/splash.png` — source images for generating all native icon/splash sizes.
- `package.json` — Capacitor dependencies and helper scripts.

---

## Prerequisites

**For both platforms**
- Node.js 18+ and npm.
- Run `npm install` once in this folder to pull Capacitor.

**Android**
- [Android Studio](https://developer.android.com/studio) (Windows / macOS / Linux).
- A **Google Play Developer** account (one-time registration fee) to publish. *Confirm the current fee on the Play Console signup page.*

**iPhone / iPad**
- A **Mac** with **Xcode** (from the Mac App Store). iOS apps **cannot** be built on Windows — this is the one hard requirement.
- An **Apple Developer Program** account (annual fee) to publish. *Confirm the current fee on developer.apple.com.*
- CocoaPods (`sudo gem install cocoapods`) — Capacitor uses it for iOS.

---

## One-time setup

```bash
# 1. Install dependencies (Capacitor core + CLI + platforms)
npm install

# 2. Build the web bundle into www/
npm run build:web

# 3. Add the native platforms (creates android/ and ios/ folders)
npx cap add android
npx cap add ios        # macOS only

# 4. Generate all icon + splash sizes from resources/icon.png and resources/splash.png
npm run assets
```

---

## Everyday workflow (after you change the web app)

```bash
npm run sync           # copies web files into www/ and syncs into native projects
npm run open:android   # opens Android Studio
npm run open:ios       # opens Xcode (macOS only)
```

Then press **Run** in Android Studio / Xcode to launch on an emulator or a connected device.

---

## Publishing to Google Play (Android)

1. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
2. Create an upload keystore when prompted and **keep it safe** — you need the same key for every future update.
3. Go to the **Google Play Console → Create app**, fill in store listing, screenshots, privacy policy, content rating.
4. Upload the `.aab` to the **Production** (or Internal testing) track and submit for review.

## Publishing to the App Store (iPhone)

1. In Xcode: set your **Team** (from your Apple Developer account) under *Signing & Capabilities*.
2. Select **Any iOS Device**, then **Product → Archive**.
3. In the Organizer window, **Distribute App → App Store Connect → Upload**.
4. In **App Store Connect**, create the app record, add screenshots, description, privacy details, then submit for review.

---

## Important: trademark & licensing

The name "Arsenal", the club crest, and Premier League fixtures/branding are **trademarked / licensed IP**.
Publishing a public app that uses them can be rejected by the stores or draw a takedown, even for a fan project.

Before public release, consider:
- Using a **neutral app name and icon** (the provided icon is a generic "AP" monogram, not the club crest — that's intentional).
- The in-app Arsenal crest images load from ESPN's CDN; for a published app you may want to remove or replace club logos, or seek permission.
- Adding a disclaimer that the app is an unofficial fan project, not affiliated with Arsenal FC or the Premier League.

This is not legal advice — if you plan to distribute widely, it's worth a quick check with someone who knows IP/licensing.

---

## Note on the Supabase key

`config.js` ships a **publishable** Supabase key — that's expected for client apps. Access is controlled by the
Row Level Security policies on the `arsenal_` tables. The current policies allow public read/write, which is fine for a
casual predictor but means anyone could read/write those tables. Tighten the RLS policies before a wide public launch.

---

## Optional next steps

- **Push notifications** ("Your prediction locks in 30 minutes!") via `@capacitor/push-notifications` + Firebase (Android) / APNs (iOS).
- **Live match reminders** scheduled locally via `@capacitor/local-notifications`.
- **Deep links** so shared fixture links open the app.

Ask and I can wire any of these in.
