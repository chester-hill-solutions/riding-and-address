# @chester-hill-solutions/validation

Canadian input normalization, Zod schemas, and form validation helpers.

**Install:** [docs/USING-PACKAGES.md](../../docs/USING-PACKAGES.md)

```bash
bun add @chester-hill-solutions/validation@^0.3.0
```

**Peer:** `zod` ^4.x (installed transitively via `http` if you use both).

## Example

```typescript
import { normalizeEmail, EmailSchema, formatZodError } from "@chester-hill-solutions/validation";

const email = normalizeEmail(rawInput);
const parsed = EmailSchema.safeParse(email);
if (!parsed.success) {
  return jsonError({ error: formatZodError(parsed.error) }, 400);
}
```

## Main exports

- **Normalization:** `normalizeEmail`, `normalizePhoneNumber`, `normalizePostalCode`, `normalizeName`, …
- **Address lists:** `splitEmailList`, `parseEmailList` (split comma/semicolon/newline lists, validate, de-duplicate)
- **Schemas:** `EmailSchema`, `PhoneSchema`, `CanadianPostalCodeSchema`, `NameSchema`, …
- **Forms:** `validateFormData`, `validateFormDataWithFieldErrors`
- **Errors:** `formatZodError`, `formatFieldErrors`, `isZodError`

## Develop in this repo

```bash
bun run --cwd packages/validation test
bun run --cwd packages/validation build
```

## Canadian address contract

`normalizeCanadianProvinceCode` returns a recognized two-letter code or `undefined`; unlike
`normalizeProvince`, it resolves aliases rather than applying title case. Numeric StatCan IDs
belong in dataset adapters. `normalizeCanadianPostalCode` returns a spaced, uppercase code only
when it matches the existing Canadian format rule. It does not verify postal assignment or delivery.
Other countries and empty values return `undefined`, so consumers can choose their own fallback.

Import `canadianAddressFixtures` from `@chester-hill-solutions/validation/fixtures/canadian-address`
to run the same compatibility vectors in consumers. CanCoder and contact-import both use them.
