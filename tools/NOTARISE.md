# Notarising the macOS installer

Gatekeeper will not run an unsigned script. Notarising removes the warning: the
application opens on a double-click with no dialog and no security setting to
change.

A `.command` file cannot be notarised. Apple accepts applications, installer
packages and disk images, so the installer is wrapped in `Install edu-pack.app`.

## What is already in place

```
certificate   Developer ID Application: Darren Coxon (2J8K99KZC6)
tool          xcrun notarytool 1.1.1 (Apple Command Line Tools)
```

The certificate being present is why `tools/build-installer-app.sh` can sign
without further setup.

## Step 1 — create an app-specific password

A notarisation password is not the Apple ID password.

1. Sign in at <https://appleid.apple.com>.
2. **Sign-In and Security** → **App-Specific Passwords** → **Generate**.
3. Name it `edu-pack notarytool`.
4. Copy the value, in the form `abcd-efgh-ijkl-mnop`.

Nothing else in the account needs changing.

## Step 2 — store the password in the keychain

Run this once. The command asks for the password, so it does not appear in the
shell history or in any file:

```bash
xcrun notarytool store-credentials "edu-pack" \
  --apple-id "darren@coxon.ai" \
  --team-id "2J8K99KZC6" \
  --password "abcd-efgh-ijkl-mnop"
```

Expected output: `Credentials saved to keychain.`

Verify at any time:

```bash
xcrun notarytool history --keychain-profile "edu-pack"
```

## Step 3 — build, sign, notarise and staple

```bash
tools/build-installer-app.sh --notarise
```

The script performs, in order:

1. Copies the pack into the application bundle.
2. Signs the launcher, then the bundle — inside-out, because `--deep` is
   deprecated and conceals signing faults.
3. Submits the bundle to Apple and waits.
4. Staples the ticket to the bundle, so it validates without a network request.
5. Re-zips it as `../dist/edu-pack-installer-<version>.zip`.
6. Runs `spctl` to confirm Gatekeeper accepts it.

Notarisation usually takes two to five minutes. Apple returns `status: Accepted`
or a list of problems.

## Step 4 — confirm before distributing

```bash
spctl -a -vvv -t exec "../dist/Install edu-pack.app"
```

Expected:

```
Install edu-pack.app: accepted
source=Notarized Developer ID
```

Before notarising the same command reports `rejected`, `source=Unnotarized
Developer ID`. That difference is the whole point of the process.

## Step 5 — distribute the application, not the `.command`

Attach `edu-pack-installer-<version>.zip` to the release, containing the stapled
application. A teacher then:

1. Unzips it.
2. Double-clicks **Install edu-pack**.
3. Reads the dialog, quits DeepSeek Harness, reopens it, types `/`.

No Terminal, no security settings, no right-click.

## If notarisation fails

| Message | Cause | Correction |
|---|---|---|
| `status: Invalid` with "signature invalid" | The bundle was altered after signing | Rebuild; never edit the bundle after signing |
| "The executable does not have the hardened runtime enabled" | `--options runtime` missing | The build script always passes it |
| "Invalid credentials" | Wrong app-specific password, or the Apple ID | Regenerate the password; confirm the team ID |
| `spctl` still says `rejected` | Staple not applied, or the wrong copy | Run `xcrun stapler staple` on the distributed file |

Retrieve the full report for any submission:

```bash
xcrun notarytool log <submission-id> --keychain-profile "edu-pack"
```

## Renewal

The Developer ID certificate expires after five years. Notarisation tickets do not
expire with it; the application continues to open. Replace the certificate when
Apple notifies you and rebuild.
