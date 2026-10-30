# iOS CI/CD (TestFlight)

## What the pipeline does

`.github/workflows/ios-testflight.yml` runs only when you start it by hand (Actions > iOS TestFlight > Run workflow). On a macOS runner it:

1. Checks that every required secret is set. If any is missing it stops at once and names the missing secrets (never their values).
2. Installs fastlane through bundler (`apps/ios/Gemfile`, locked by `Gemfile.lock`).
3. Runs `xcodegen generate` to create `Spendoza.xcodeproj`.
4. Writes `apps/ios/Configurations/Secrets.Prod.xcconfig` (gitignored) from `PROD_SUPABASE_URL` and `PROD_SUPABASE_ANON_KEY`. `Prod.xcconfig` includes it for the Release configuration.
5. Runs `bundle exec fastlane beta` (`apps/ios/fastlane/Fastfile`), which:
   - sets the build number to the workflow run number (`BUILD_NUMBER`),
   - imports the stored distribution certificate and installs the two App Store provisioning profiles (app and widgets),
   - applies each profile to its own target (`Spendoza`, `SpendozaWidgets`) with the team from `APPLE_TEAM_ID`,
   - builds the Release configuration and exports an App Store IPA,
   - uploads it to TestFlight without waiting for Apple's processing.

The marketing version comes from `MARKETING_VERSION` in `apps/ios/project.yml`.

## App icon

App Store Connect rejects an upload without an app icon. The app ships a placeholder: a single 1024 x 1024 universal PNG at `apps/ios/Spendoza/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, set as the app icon by `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` in `project.yml`. It is drawn from the app's theme (the note-green field with the engraved dial in paper tones, no text), opaque with no alpha channel, by `AppIconArtwork` in `apps/ios/SpendozaTests/AppIconTests.swift`.

- To replace it, drop in your own opaque 1024 x 1024 PNG under the same name. `AppIconTests` checks it is 1024 x 1024 with no alpha and that the built app has a primary icon.
- To regenerate the placeholder after changing the artwork, run the test with `TEST_RUNNER_WRITE_APP_ICON=1` set (for example `TEST_RUNNER_WRITE_APP_ICON=1 xcodebuild test ... -only-testing:'SpendozaTests/AppIconTests/theArtworkRendersOpaqueAt1024()'`).

## Owner checklist

These need your Apple Developer account (Gravitaz LLC; Apple may ask for the DUNS number 11-904-2051) and the GitHub repo settings.

**Steps 1, 2 and 5 in one command.** In your own Terminal (it asks for your Apple ID password and a two-factor code, so it can't run unattended):

```sh
cd apps/ios
bundle install
bundle exec fastlane setup_apple                  # or add dry_run:true to see the plan first
```

It asks for your team ID (developer.apple.com > Membership) and Apple ID, or take them as `team_id:ABCDE12345 apple_id:you@example.com`. It creates only what's missing, so it's safe to re-run. If the App Store name "Spendoza" is taken, re-run with `app_name:"Spendoza Money"` (any free name; the bundle ID stays the same). If `bundle install` can't write to the system gem folder, run `bundle config set --local path vendor/bundle` first.

1. In the Apple Developer portal, create the App Group `group.com.gravitaz.spendoza`.
2. Create two App IDs, each with the App Groups capability enabled and set to `group.com.gravitaz.spendoza`:
   - `com.gravitaz.spendoza` (the app)
   - `com.gravitaz.spendoza.widgets` (the widget extension)
3. Create an Apple Distribution certificate (if you do not have one) and export it as a `.p12` with a password.
4. Create two App Store provisioning profiles for the distribution certificate, one per App ID.
5. In App Store Connect, create the app record "Spendoza" under Gravitaz LLC with bundle ID `com.gravitaz.spendoza`.
6. Create an App Store Connect API key (Users and Access > Integrations) with App Manager access. Note the key ID and issuer ID and download the `.p8`.
7. Add these secrets to the Spendoza GitHub repo (Settings > Secrets and variables > Actions). Base64 values come from `base64 -i <file> | pbcopy`.

   | Secret | Value |
   | --- | --- |
   | `APPLE_TEAM_ID` | Your 10-character Apple team ID |
   | `ASC_KEY_ID` | App Store Connect API key ID |
   | `ASC_ISSUER_ID` | App Store Connect issuer ID |
   | `ASC_KEY_CONTENT` | The `.p8` key, base64-encoded |
   | `IOS_DIST_CERT_P12` | The distribution certificate `.p12`, base64-encoded |
   | `IOS_DIST_CERT_PASSWORD` | The `.p12` password |
   | `IOS_PROVISIONING_PROFILE_APP` | The app's App Store `.mobileprovision`, base64-encoded |
   | `IOS_PROVISIONING_PROFILE_WIDGETS` | The widgets' App Store `.mobileprovision`, base64-encoded |
   | `PROD_SUPABASE_URL` | The production web app's Supabase URL (public) |
   | `PROD_SUPABASE_ANON_KEY` | The production web app's Supabase anon key (public) |

8. In App Store Connect, add TestFlight internal testers (you and your household).
9. Run the workflow. Once Apple finishes processing, install from TestFlight on a device and check: sign in, finish onboarding or see Health, drill down, add the widget, lock and unlock with Face ID.

## Running locally

```bash
cd apps/ios
bundle install
xcodegen generate
# export the secrets above (plus BUILD_NUMBER if you want a fixed one), then:
bundle exec fastlane beta
```

Without `BUILD_NUMBER` a timestamp is used. Without all the secrets the lane stops with `Missing environment: ...`.
