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

## Owner checklist

These need your Apple Developer account (Gravitaz LLC; Apple may ask for the DUNS number 11-904-2051) and the GitHub repo settings. None of it can be done from code.

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
