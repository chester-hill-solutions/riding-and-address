# Runbook — rotating the demo browser key

**What this is about.** `portal/wrangler.jsonc` carries `DEMO_BROWSER_API_KEY` as a plain `vars`
value, and the value in the file is a **live** key bound to the production `API_KEYS` KV namespace
(`2d0152b0958c48fab4a98b3046e0c08e`).

A browser key (`pk_*`) is **not a secret** — `src/api-keys.ts` states it outright: *"Browser API
keys (`pk_*)` are PUBLIC — origin allowlist + optional daily cap."* It is an identifier the browser
is meant to hold, restricted by an origin allowlist and a daily cap the server enforces.

So the problem is not disclosure. It is **rotation**:

- The value is in git history, and history is permanent. Rotating it does not remove the old value
  from the tree — it only makes the old value useless.
- Every future rotation that edits `wrangler.jsonc` writes the new value into history too, so the
  file becomes an append-only log of live credentials.
- Putting the value in the Cloudflare secret store means the repository carries only the *name*,
  and a rotation leaves no trace in the tree at all.

**Why this is not already done.** Moving the value into the secret store needs an operator with
Cloudflare credentials. Until that happens, the literal stays in the file, and
`scripts/check-secrets.mjs` carries it as a named, reviewed exception rather than failing the build
on every commit.

---

## The procedure

Order matters. The embed widget's key ships to the browser, so a deploy that removes the key before
the replacement is set breaks the marketing try-it widget until the next deploy.

### 1 — Mint the replacement

```bash
bun run keys -- mint browser --customer-id <customer> --origins https://cancoder.chesterhillsolutions.ca
```

The command prints the new key **once**. Copy it. (`bun run keys --help` for the exact flags; the
script is `scripts/manage-keys.ts`.)

### 2 — Put it in the secret store, before touching the repo

```bash
cd portal
bunx wrangler secret put DEMO_BROWSER_API_KEY
# paste the new key
```

`wrangler secret put` writes to the **default** environment. For staging:

```bash
bunx wrangler secret put DEMO_BROWSER_API_KEY --env staging
```

A secret overrides a `vars` entry of the same name, so step 2 alone makes the new key live at the
next deploy — the repository is not involved.

### 3 — Deploy and verify

```bash
cd portal && bun run build && bunx wrangler deploy
```

Then check the portal's try-it widget still searches, and that `/api/search` accepts the new key.

### 4 — Remove the literal from the repository

In `portal/wrangler.jsonc`, delete the `DEMO_BROWSER_API_KEY` line from `vars` entirely — do
**not** replace it with an empty string, because an empty `vars` entry is published as an empty
value and would shadow the secret in some configurations.

Then remove the entry from `scripts/secret-allowlist.json`:

```json
{
  "exceptions": {}
}
```

### 5 — Confirm the gate is clean

```bash
bun run check:secrets
```

It must print `secrets: ok` with **0 allowlisted exceptions**. A stale allowlist entry is itself a
failure, so the entry has to go in the same change that removes the literal.

### 6 — Rotate the old key, so it is dead

The old key still exists in the `API_KEYS` KV namespace. Disable it through the portal's keys page
or `bun run keys`, so it cannot be used even by someone who read it out of git history.

---

## The gate

`scripts/check-secrets.mjs` scans every tracked file for credential-shaped literals and fails the
build on any it does not recognise. It is wired into `bun run validate` and into CI.

It has two properties worth knowing:

- **Placeholders do not match.** `sk_test_…` and `pk_live_…` — the shapes the documentation shows —
  are not credential-shaped, because every pattern requires a plausible body. The documentation that
  explains the credential shapes stays writable.
- **An allowlist entry that no longer matches is a failure.** So the exception list cannot quietly
  become a place where exceptions go to be forgotten.

The one entry in `scripts/secret-allowlist.json` is the `DEMO_BROWSER_API_KEY` literal in
`portal/wrangler.jsonc`. This runbook is how that entry goes away.

---

## If something goes wrong mid-procedure

| Symptom | What it means | What to do |
|---|---|---|
| The try-it widget stops searching after a deploy | The `vars` entry was removed before the secret was set | `wrangler secret put DEMO_BROWSER_API_KEY` again, redeploy |
| `check:secrets` reports a stale allowlist entry | The literal was removed but the exception was not | Remove the exception entry — the two go together |
| The old key still works | Step 6 was not done | Disable it through the portal's keys page |
