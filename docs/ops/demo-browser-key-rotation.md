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

**Why it was not done sooner.** Moving the value into the secret store needed an operator with
Cloudflare credentials, and this environment did not have any: `wrangler whoami` reports *"Not
logged in. Your auth token has expired and could not be refreshed"*, and the token cannot be
refreshed non-interactively. Until then, the literal stayed in the file, and
`scripts/check-secrets.mjs` carried it as a named, reviewed exception rather than failing the build
on every commit.

**What changed.** The deploy job already holds a `CLOUDFLARE_API_TOKEN` secret, and CI can reach
the same account the deploy reaches. The rotation does not need a human's local machine at all —
it needs a job that has the credential. So it is a workflow now:
`.github/workflows/rotate-demo-browser-key.yml`, triggered by hand from the Actions tab.

---

## The workflow — the normal path

**Actions tab → Rotate the demo browser key → Run workflow.**

| Action | What it does | When |
|---|---|---|
| `mint` | Reads the old key's own customer, origins, cap and label out of the key store; mints a replacement with them; puts the replacement in the secret store; deploys; and reports which key the Worker is now serving | First |
| `revoke` | Disables a key by id, so the value that is in git history stops working | Last, after the `vars` entry is gone and deployed |

**The order is not optional.** `mint` first, then remove the `vars` entry and deploy (that is a
normal pull request, not a workflow run), then `revoke`. Running `revoke` before the `vars` entry
is gone leaves the Worker serving a key that no longer works, and the try-it widget breaks.

The new key is never printed by the workflow. It lives in the secret store and on the page the
browser reads it from, which is where a public browser key belongs. The old key's id is in git
history, and it is the argument the `revoke` action needs.

**Verifying it worked.** The portal's home page carries the key it is serving, so the live surface
answers the question directly:

```bash
curl -s https://cancoder.chesterhillsolutions.ca/ | grep -oE 'pk_live_[a-f0-9]+' | head -1
```

And the key the page carries must still be accepted:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://cancoder.chesterhillsolutions.ca/api/search?q=1&key=$(curl -s https://cancoder.chesterhillsolutions.ca/ | grep -oE 'pk_live_[a-f0-9]+' | head -1)"
```

### The one permission it needs

**The token the deploy job holds does not have `Workers KV Storage: Edit`.** It can deploy the
Worker, apply D1 migrations, and read and write the Worker's secret store — and it cannot touch the
key store, which is where browser keys live.

That is not a shortcoming of the workflow; it is a fact about the token, and the token's permissions
are the account administrator's to grant. The `check` action reports exactly which of the three
permissions is present, so the request can be specific:

> Add **Workers KV Storage → Edit** for the account to the API token the deploy job uses.

With that one permission, `mint` and `revoke` both work and the rotation is two runs and one pull
request.

---

## The procedure — by hand, if the workflow is not available

The steps below are what the workflow automates. They need `wrangler login` or a
`CLOUDFLARE_API_TOKEN` in the environment.

Order matters. The embed widget's key ships to the browser, so a deploy that removes the key before
the replacement is set breaks the marketing try-it widget until the next deploy.

### 1 — Mint the replacement

```bash
bun run keys -- mint browser --customer-id <customer> --origins https://cancoder.chesterhillsolutions.ca
```

The command prints the new key **once**. Copy it. (`bun run keys --help` for the exact flags; the
script is `scripts/manage-keys.ts`.)

**Or read the old key's own parameters and carry them over.** The replacement is not the same key
with a new value — it is a different key that happens to sit in the same place, and it is served to
nobody if the origin allowlist was left behind. So the parameters are read, not transcribed:

```bash
# The key's record: customer, origin allowlist, daily cap, label.
curl -s -H "Authorization: Bearer $PROJECTION_ADMIN_SECRET" \
  https://cancoder.chesterhillsolutions.ca/admin/projection/keys/pk_live_…
```

That route is the application's own ops interface for minting, reading and revoking keys, and it is
what the rotation workflow uses. It is closed in production — `PROJECTION_ADMIN_SECRET` is not set —
and the workflow opens it for the duration of a run and closes it again.

**And what else is on the same Customer.** A key left behind by an earlier rotation is attached to a
real Customer and is not visible from anywhere else, so the interface can list them:

```bash
curl -s -H "Authorization: Bearer $PROJECTION_ADMIN_SECRET" \
  "https://cancoder.chesterhillsolutions.ca/admin/projection/keys?customer=<customer>"
```

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
