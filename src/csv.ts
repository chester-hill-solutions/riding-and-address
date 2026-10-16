/** Strict RFC-4180 records, including quoted newlines; malformed/truncated input fails closed. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let cells: string[] = [], cell = '', quoted = false, closedQuote = false;
  const endCell = () => { cells.push(cell); cell = ''; closedQuote = false; };
  const endRow = () => {
    endCell();
    if (cells.some((value) => value.trim())) records.push(cells);
    cells = [];
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === '"') {
      if (cell || closedQuote) throw new Error('Unexpected CSV quote');
      quoted = true;
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      if (closedQuote) throw new Error('Text after CSV closing quote');
      cell += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || cells.length || closedQuote) endRow();
  const header = records.shift();
  if (!header || header.some((key) => !key) || new Set(header).size !== header.length) throw new Error('Missing/duplicate CSV header');
  return records.map((values) => {
    if (values.length !== header.length) throw new Error('Truncated or extra CSV columns');
    return Object.fromEntries(header.map((key, i) => [key, values[i].trim()]));
  });
}

