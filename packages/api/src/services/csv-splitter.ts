/**
 * CSV month-splitting utility.
 *
 * Parses a CSV string, detects the date column, groups rows by YYYY-MM,
 * and returns per-month CSV chunks so each can be processed independently.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CsvSplitResult =
  | { isMultiMonth: false }
  | { isMultiMonth: true; monthChunks: Map<string, string> };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a CSV string by month. Returns per-month CSV chunks (header + rows)
 * if the data spans multiple months, otherwise signals single-month.
 */
export function splitCsvByMonth(csvText: string): CsvSplitResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { isMultiMonth: false };

  const headerLine = lines[0];
  const headers = parseCsvRow(headerLine);
  const dataLines = lines.slice(1);

  // Parse all data rows
  const rows = dataLines.map((line) => parseCsvRow(line));

  // Detect which column holds dates
  const dateColIdx = detectDateColumnIndex(headers, rows.slice(0, 20));
  if (dateColIdx < 0) return { isMultiMonth: false };

  // Group rows by YYYY-MM
  const monthRows = new Map<string, string[]>();
  let parsedCount = 0;

  for (const line of dataLines) {
    const cols = parseCsvRow(line);
    const dateVal = cols[dateColIdx]?.trim();
    const parsed = dateVal ? parseDate(dateVal) : null;

    if (parsed) {
      parsedCount++;
      const ym = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
      const group = monthRows.get(ym) ?? [];
      group.push(line);
      monthRows.set(ym, group);
    } else {
      // Rows with unparseable dates go into a special bucket
      const group = monthRows.get("_unknown") ?? [];
      group.push(line);
      monthRows.set("_unknown", group);
    }
  }

  // If we couldn't parse enough dates, bail out
  if (parsedCount < dataLines.length * 0.5) {
    return { isMultiMonth: false };
  }

  // Move unknown rows into the largest month bucket
  const unknownRows = monthRows.get("_unknown");
  if (unknownRows && unknownRows.length > 0) {
    monthRows.delete("_unknown");
    let bestMonth = "";
    let bestCount = 0;
    for (const [month, rows] of monthRows) {
      if (rows.length > bestCount) {
        bestMonth = month;
        bestCount = rows.length;
      }
    }
    if (bestMonth) {
      monthRows.get(bestMonth)!.push(...unknownRows);
    }
  }

  if (monthRows.size <= 1) return { isMultiMonth: false };

  // Build per-month CSV chunks: header + month's rows
  const monthChunks = new Map<string, string>();
  for (const [month, rows] of monthRows) {
    monthChunks.set(month, headerLine + "\n" + rows.join("\n"));
  }

  return { isMultiMonth: true, monthChunks };
}

// ---------------------------------------------------------------------------
// Date column detection
// ---------------------------------------------------------------------------

const DATE_HEADER_EXACT = [
  "date",
  "transaction date",
  "posting date",
  "posted date",
  "post date",
  "trans date",
  "effective date",
];

/**
 * Find the index of the column most likely to contain transaction dates.
 * Returns -1 if no date column can be identified.
 */
export function detectDateColumnIndex(headers: string[], sampleRows: string[][]): number {
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());

  // Priority 1: exact header name match
  for (const target of DATE_HEADER_EXACT) {
    const idx = lowerHeaders.indexOf(target);
    if (idx >= 0 && verifyDateColumn(sampleRows, idx)) return idx;
  }

  // Priority 2: partial match on "date"
  for (let i = 0; i < lowerHeaders.length; i++) {
    if (lowerHeaders[i].includes("date") && verifyDateColumn(sampleRows, i)) return i;
  }

  // Priority 3: value-sniff each column
  for (let i = 0; i < headers.length; i++) {
    if (verifyDateColumn(sampleRows, i, 0.6)) return i;
  }

  return -1;
}

/** Check if at least `threshold` fraction of sample rows parse as dates in the given column. */
function verifyDateColumn(rows: string[][], colIdx: number, threshold = 0.5): boolean {
  if (rows.length === 0) return false;
  let hits = 0;
  for (const row of rows) {
    const val = row[colIdx]?.trim();
    if (val && parseDate(val)) hits++;
  }
  return hits / rows.length >= threshold;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse common bank CSV date formats.
 * Supported: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, M/D/YYYY, MM/DD/YY
 */
export function parseDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;

  // YYYY-MM-DD
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isValidDate(d)) return d;
  }

  // MM/DD/YYYY or M/D/YYYY
  m = v.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})$/);
  if (m) {
    const d = new Date(+m[3], +m[1] - 1, +m[2]);
    if (isValidDate(d)) return d;
  }

  // MM-DD-YYYY
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const d = new Date(+m[3], +m[1] - 1, +m[2]);
    if (isValidDate(d)) return d;
  }

  // MM/DD/YY
  m = v.match(/^(\d{1,2})[/](\d{1,2})[/](\d{2})$/);
  if (m) {
    const year = +m[3] + (+m[3] >= 70 ? 1900 : 2000);
    const d = new Date(year, +m[1] - 1, +m[2]);
    if (isValidDate(d)) return d;
  }

  return null;
}

function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime());
}

// ---------------------------------------------------------------------------
// CSV row parsing (handles quoted fields with commas)
// ---------------------------------------------------------------------------

/** Parse a single CSV line into fields, respecting quoted fields. */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}
