/**
 * CSV, and getting it onto disk.
 *
 * Not .xlsx: a real Excel workbook is a zip of XML parts and needs a library
 * for what Excel opens natively anyway. A .csv double-clicks straight into
 * Excel, Numbers and Sheets, and stays readable in a text editor when
 * something has gone wrong with it. The download is labelled honestly.
 */

/**
 * One field, escaped.
 *
 * A rupee total with a comma in it, a guest called "O'Brien, J", a note
 * containing a newline — each of these silently breaks a CSV built by joining
 * strings, and the damage shows up as columns shifted by one halfway down a
 * file nobody re-reads.
 *
 * A leading =, +, - or @ is prefixed with a quote: Excel treats those as
 * formulas, so a note beginning "=" becomes a spreadsheet injection.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to a CSV document. The first row is the header. */
export const toCsv = (rows: unknown[][]): string =>
  rows.map((row) => row.map(csvField).join(",")).join("\r\n");

/**
 * Hand the file to the browser.
 *
 * The BOM is what makes Excel on Windows read it as UTF-8; without it, ₹ and
 * any guest with a non-ASCII name arrive as mojibake.
 */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
