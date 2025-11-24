/**
 * Find the approximate position of a phrase on a PDF page using pdfjs textContent.
 * Returns { page, x, y, width, height } in PDF user space coordinates (points) or null if not found.
 */
export async function findPhrasePosition(pdfBytes: Buffer, phrase: string, opts?: { page?: number; occurrence?: 'first' | 'last' | 'nth'; nth?: number; caseSensitive?: boolean }) {
  // Lazy-require pdfjs to avoid loading heavy native polyfills (canvas) at server startup.
  // This prevents the "Cannot polyfill DOMMatrix/Path2D: Cannot find module 'canvas'" warnings
  // when the PDF utilities are not used during normal server operation.
  const pdfjsLib: any = require('pdfjs-dist/legacy/build/pdf.js');
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  const total = doc.numPages || doc._pdfInfo?.numPages || 0;
  const searchPhrase = (opts?.caseSensitive ? phrase : phrase.toLowerCase()).trim();

  const pagesToSearch: number[] = [];
  if (opts && opts.page && opts.page >= 1 && opts.page <= total) {
    pagesToSearch.push(opts.page);
  } else {
    for (let i = 1; i <= total; i++) pagesToSearch.push(i);
  }

  const matches: Array<{ page: number; x: number; y: number; width: number; height: number }> = [];

  for (const p of pagesToSearch) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    const items = textContent.items || [];
    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        const str: string = item.str || '';
        const cmp = opts?.caseSensitive ? str : str.toLowerCase();
        const idx = cmp.indexOf(searchPhrase);
        if (idx !== -1) {
          // approximate bounding box
          const transform = item.transform || [1,0,0,1,0,0];
          const x = transform[4];
          const y = transform[5];
          const width = item.width || (searchPhrase.length * (item.fontSize || 10) * 0.5) || 50;
          const height = item.height || (item.fontSize || 10) || 10;
          matches.push({ page: p, x, y, width, height });
          if (opts?.occurrence === 'first' || !opts?.occurrence) return matches[0];
        }
      } catch (e) {
        // ignore item parse errors
      }
    }
  }

  if (matches.length === 0) return null;
  if (opts?.occurrence === 'last') return matches[matches.length - 1];
  if (opts?.occurrence === 'nth' && opts?.nth && opts.nth >= 1 && opts.nth <= matches.length) return matches[opts.nth - 1];
  return matches[0];
}

export default { findPhrasePosition };
