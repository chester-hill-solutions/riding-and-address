export const RETURN_FIELD_TOKENS = ['municipality'] as const;

export type ReturnField = (typeof RETURN_FIELD_TOKENS)[number];

export interface ReturnSelectorParseResult {
  valid: boolean;
  fields: ReturnField[];
  error?: string;
}

export interface IncludeProvinceParseResult {
  valid: boolean;
  /** undefined when the flag was not provided */
  value?: boolean;
  error?: string;
}

/**
 * Parses a comma-separated `return` query value into supported expansion tokens.
 */
export function parseReturnSelector(raw: string | undefined): ReturnSelectorParseResult {
  if (!raw || !raw.trim()) {
    return { valid: true, fields: [] };
  }

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const fields: ReturnField[] = [];
  const seen = new Set<ReturnField>();

  for (const part of parts) {
    if (!RETURN_FIELD_TOKENS.includes(part as ReturnField)) {
      return {
        valid: false,
        fields: [],
        error: `Unknown return field: ${part}. Supported: ${RETURN_FIELD_TOKENS.join(', ')}`,
      };
    }

    const token = part as ReturnField;
    if (!seen.has(token)) {
      seen.add(token);
      fields.push(token);
    }
  }

  return { valid: true, fields };
}

/**
 * Parses the separate `include_province` flag.
 */
export function parseIncludeProvince(raw: string | undefined): IncludeProvinceParseResult {
  if (raw === undefined || !raw.trim()) {
    return { valid: true, value: undefined };
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return { valid: true, value: true };
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return { valid: true, value: false };
  }

  return {
    valid: false,
    error: 'include_province must be true or false',
  };
}

/**
 * Resolves whether provincial data should be included for this request.
 * `/api/combined` defaults to true unless explicitly set to false.
 */
export function resolveIncludeProvince(
  pathname: string,
  includeProvince?: boolean
): boolean {
  if (includeProvince !== undefined) {
    return includeProvince;
  }
  return pathname === '/api/combined';
}

export function isFederalLookupPath(pathname: string): boolean {
  return pathname === '/api' || pathname === '/api/federal' || pathname === '/api/combined';
}

export function wantsReturnField(fields: ReturnField[], field: ReturnField): boolean {
  return fields.includes(field);
}
