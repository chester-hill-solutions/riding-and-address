# Canada Post-Style Address Formatting

## Purpose

The ODA geolocation service returns addresses formatted in a **Canada Post-style** mailing layout. These are ODA-derived and **not** Canada Post-certified. Official deliverability validation requires a licensed Canada Post product.

## Structured fields

```typescript
interface CanadaPostStyleAddress {
  line1: string;           // Unit line when present, else civic + street
  line2?: string;          // Civic + street when unit is on line1
  municipality: string;
  province: string;        // Two-letter abbreviation (ON, QC, ...)
  postalCode?: string;     // A1A 1A1 format
  country: 'CANADA';
  formattedSingleLine: string;
  formattedMultiline: string;
  canadaPostCertified: false;
}
```

## Examples

### Without unit

```
123 MAIN ST
TORONTO ON  M5V 2T6
CANADA
```

Single line: `123 MAIN ST, TORONTO ON M5V 2T6, CANADA`

### With unit

```
UNIT 1205
123 MAIN ST
TORONTO ON  M5V 2T6
CANADA
```

### Quebec (French street)

```
350 RUE SAINT-PAUL E
MONTREAL QC  H2Y 1H2
CANADA
```

## Formatting rules

1. **Uppercase** all mailing fields
2. **Postal code**: `A1A 1A1` with space after FSA
3. **Province**: two-letter abbreviation (`ON`, `QC`, `AB`, ...)
4. **Street types**: abbreviated in mailing lines (`ST`, `AVE`, `RD`, `BLVD`, `CRES`, `DR`, `CRT`, `PL`, `PKY`, `HWY`, `RUE`, `CH`)
5. **Unit**: separate first line (`UNIT`, `APT`, `SUITE` + number)
6. **No punctuation** in mailing lines unless required by source data
7. **`CANADA`** included in multiline output; included in single-line output
8. **`canadaPostCertified`**: always `false`

## Field mapping from ODA

| ODA field | Mailing field |
|-----------|---------------|
| Unit | `line1` (prefixed with UNIT/APT/SUITE) |
| Civic Number + Street Name + Type + Direction | `line1` or `line2` |
| Processed City | `municipality` |
| Province code | `province` |
| Postal Code | `postalCode` |

## Search vs mailing normalization

Two separate normalization modes:

- **Search normalization** (`oda-normalize.ts`): lossy, accent-folded, punctuation-stripped — used for matching
- **Mailing formatting** (`canada-post-format.ts`): deterministic Canada Post-style output — used for API responses
