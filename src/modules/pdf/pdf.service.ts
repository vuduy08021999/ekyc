import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { AppError } from '../../common/errors/app-error';

// Default P12 storage folder (same as SignatureService)
const DEFAULT_P12_STORAGE = process.env.P12_STORAGE_DIR || path.resolve(__dirname, '../../../storage/p12');

const CM_IN_POINTS = 72 / 2.54; // 1 cm in PDF points (72 points per inch)

const normalizeText = (s: string) => {
  if (!s) return '';
  let t = String(s);
  try {
    t = t.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch (e) {
    t = t.normalize ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : t;
  }
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
};

const hexToRgb = (h: string) => {
  const s = (h || '').replace('#', '').trim();
  const hh = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padStart(6, '0');
  const r = parseInt(hh.slice(0, 2), 16) || 0;
  const g = parseInt(hh.slice(2, 4), 16) || 0;
  const b = parseInt(hh.slice(4, 6), 16) || 0;
  return [r / 255, g / 255, b / 255];
};

async function runPdf2jsonCliOnPdfBuffer(buf: Buffer, tmpPrefix = 'pdf2json_cli_') {
  // writes temp pdf and runs pdf2json CLI, returns parsed JSON or null
  const tmpDir = path.resolve(__dirname, '../../../tmp/pdf2json_cli');
  if (!fsSync.existsSync(tmpDir)) fsSync.mkdirSync(tmpDir, { recursive: true });
  const tmpPdf = path.join(tmpDir, `${tmpPrefix}${Date.now()}.pdf`);
  fsSync.writeFileSync(tmpPdf, buf);

  const localBin = path.resolve(__dirname, '../../../node_modules/.bin/pdf2json');
  const localBinCmd = localBin + (process.platform === 'win32' ? '.cmd' : '');
  const pdf2jsonJs = path.resolve(__dirname, '../../../node_modules/pdf2json/bin/pdf2json.js');

  const execFile = require('child_process').execFile;
  const spawnNode = require('child_process').spawnSync;

  let ran = false;
  // Try local .cmd / binary
  try {
    if (fsSync.existsSync(localBinCmd)) {
      execFile(localBinCmd, ['-f', tmpPdf, '-o', tmpDir], { cwd: path.resolve(__dirname, '../../../') });
      ran = true;
    }
  } catch (e) {
    // ignore
  }

  // try node <pdf2jsonJs>
  if (!ran && fsSync.existsSync(pdf2jsonJs)) {
    try {
      spawnNode(process.execPath, [pdf2jsonJs, '-f', tmpPdf, '-o', tmpDir], { cwd: path.resolve(__dirname, '../../../') });
      ran = true;
    } catch (e) {
      // ignore
    }
  }

  // fallback to npx
  if (!ran) {
    try {
      execFile('npx', ['pdf2json', '-f', tmpPdf, '-o', tmpDir], { cwd: path.resolve(__dirname, '../../../') });
      ran = true;
    } catch (e) {
      // ignore
    }
  }

  if (!ran) return null;

  // find generated JSON
  const generated = fsSync.readdirSync(tmpDir).find((f) => f.startsWith(tmpPrefix) && f.endsWith('.json'));
  if (!generated) return null;
  try {
    const raw = fsSync.readFileSync(path.join(tmpDir, generated), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * Sign a PDF buffer using a server-stored P12. This function attempts to add a
 * signature placeholder without reserializing an existing signed PDF (preserving
 * previous signatures). It falls back to re-saving the PDF without object streams
 * when required.
 */
async function signPdfP12PlainBase64(body: any): Promise<{ pdfBase64: string }> {
  const { ekycId, pdfBase64, reason, location, name, contactInfo } = body;

  if (!ekycId || typeof ekycId !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'ekycId is required');
  }

  const p12Path = path.join(DEFAULT_P12_STORAGE, `${ekycId}.p12`);
  if (!fsSync.existsSync(p12Path)) {
    throw new AppError(404, 'NOT_FOUND', 'P12 not found for given ekycId');
  }

  const p12Buffer = await fs.readFile(p12Path);
  const passphrase = process.env.SIGN_P12_PASSPHRASE || 'changeit';

  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'pdfBase64 is required');
  }

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');

  const tryPlainAdd = (buf: Buffer) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const helpers: any = require('node-signpdf/dist/helpers');
    if (typeof helpers.plainAddPlaceholder !== 'function') throw new Error('plainAddPlaceholder helper not found');
    return helpers.plainAddPlaceholder({ pdfBuffer: buf, reason: reason || '', location: location || '', name: name || '', contactInfo: contactInfo || '', signatureLength: 16100 });
  };

  let prepared: Buffer | null = null;
  try {
    prepared = tryPlainAdd(pdfBuffer);
  } catch (e) {
    // try placeholder package
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const placeholder: any = require('@signpdf/placeholder-plain');
      if (typeof placeholder.addPlaceholder === 'function') {
        prepared = placeholder.addPlaceholder({ pdfBuffer, reason: reason || '', location: location || '', name: name || '', contactInfo: contactInfo || '', signatureLength: 16100 });
      } else if (typeof placeholder.default === 'function') {
        prepared = placeholder.default({ pdfBuffer, reason: reason || '', location: location || '', name: name || '', contactInfo: contactInfo || '', signatureLength: 16100 });
      }
    } catch (e2) {
      // if PDF already contains a ByteRange (existing signatures) we must not reserialize
      const pdfText = pdfBuffer.toString('latin1');
      const hasExistingSignature = /\/ByteRange\s*\[/.test(pdfText);
      if (hasExistingSignature) {
        throw new AppError(500, 'SIGN_PREPARE_FAILED', 'Failed to prepare PDF placeholder for signing. PDF contains existing signatures and helper failed to append placeholder.', { error: (e2 as any)?.message ?? String(e2) });
      }

      // resave without object streams and try again
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PDFDocument } = require('pdf-lib');
        const doc = await PDFDocument.load(pdfBuffer);
        const resaved = await doc.save({ useObjectStreams: false, addDefaultPage: false });
        try {
          prepared = tryPlainAdd(Buffer.from(resaved));
        } catch (e3) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const placeholder2: any = require('@signpdf/placeholder-plain');
            if (typeof placeholder2.addPlaceholder === 'function') {
              prepared = placeholder2.addPlaceholder({ pdfBuffer: Buffer.from(resaved), reason: reason || '', location: location || '', name: name || '', contactInfo: contactInfo || '', signatureLength: 16100 });
            } else if (typeof placeholder2.default === 'function') {
              prepared = placeholder2.default({ pdfBuffer: Buffer.from(resaved), reason: reason || '', location: location || '', name: name || '', contactInfo: contactInfo || '', signatureLength: 16100 });
            }
          } catch (e4) {
            throw new AppError(500, 'SIGN_PREPARE_FAILED', 'Failed to prepare PDF placeholder for signing (resave fallback failed)', { error: (e4 as any)?.message ?? String(e4) });
          }
        }
      } catch (resaveErr) {
        throw new AppError(500, 'SIGN_PREPARE_FAILED', 'Failed to prepare PDF placeholder for signing (resave fallback failed)', { error: (resaveErr as any)?.message ?? String(resaveErr) });
      }
    }
  }

  if (!prepared) throw new AppError(500, 'SIGN_PREPARE_FAILED', 'Failed to prepare PDF for signing');

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SignPdf } = require('node-signpdf');
    const signer: any = new SignPdf();
    const signed: Buffer = signer.sign(prepared, p12Buffer, { passphrase });
    return { pdfBase64: signed.toString('base64') };
  } catch (err) {
    throw new AppError(500, 'SIGN_FAILED', 'Failed to sign PDF', { error: (err as any)?.message ?? String(err) });
  }
}

// Wrapper used by /sign route — delegate to P12 signing (same behaviour)
async function signPdfBase64(body: any): Promise<{ pdfBase64: string }> {
  return signPdfP12PlainBase64(body);
}

// Visible signing: render appearances on an unsigned copy then cryptographically
// sign sequentially so previous signatures are preserved.
async function signPdfVisibleBase64(body: any): Promise<{ pdfBase64: string }> {
  const { pdfBase64, signers } = body as any;
  if (!pdfBase64 || typeof pdfBase64 !== 'string') throw new AppError(400, 'INVALID_INPUT', 'pdfBase64 is required');
  if (!Array.isArray(signers) || signers.length === 0) throw new AppError(400, 'INVALID_INPUT', 'signers array is required and must contain at least one signer');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

  const inputBuf = Buffer.from(pdfBase64, 'base64');
  const doc = await PDFDocument.load(inputBuf);
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const anchorPositions: Map<number, { pageIndex: number; x: number; y: number; width: number; height: number }> = new Map();

  // Try pdfjs-dist first
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs: any = require('pdfjs-dist/legacy/build/pdf.js');
    const loadingTask = pdfjs.getDocument({ data: inputBuf });
    const pdfJsDoc = await loadingTask.promise;

    const findPhraseInPage = async (page: any, phrase: string) => {
      try {
        const normPhrase = normalizeText(phrase);
        if (!normPhrase) return null;
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();
        const items = textContent.items || [];
        const MAX_JOIN = 8;
        for (let i = 0; i < items.length; i++) {
          let combined = '';
          for (let j = i; j < Math.min(items.length, i + MAX_JOIN); j++) {
            combined += String(items[j].str || '');
            const normCombined = normalizeText(combined);
            if (normCombined.indexOf(normPhrase) !== -1) {
              let minX = Number.POSITIVE_INFINITY;
              let maxX = Number.NEGATIVE_INFINITY;
              let minY = Number.POSITIVE_INFINITY;
              let maxY = Number.NEGATIVE_INFINITY;
              for (let k = i; k <= j; k++) {
                const it = items[k];
                let tx: any;
                try { tx = pdfjs.Util.transform(viewport.transform, it.transform); } catch (te) { tx = it.transform || [1, 0, 0, 1, 0, 0]; }
                const itemX = tx[4];
                const itemY = tx[5];
                const fontHeight = Math.abs(tx[3]) || 10;
                const itemWidth = typeof it.width === 'number' && it.width > 0 ? it.width : (String(it.str || '').length * (fontHeight * 0.5));
                minX = Math.min(minX, itemX);
                maxX = Math.max(maxX, itemX + itemWidth);
                minY = Math.min(minY, itemY);
                maxY = Math.max(maxY, itemY + fontHeight);
              }
              if (minX !== Number.POSITIVE_INFINITY) return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            }
          }
        }
      } catch (e) {
        return null;
      }
      return null;
    };

    for (let si = 0; si < signers.length; si++) {
      const signer = signers[si];
      if (!signer || !signer.anchorPhrase) continue;
      const phrase = String(signer.anchorPhrase || '');
      if (typeof signer.page === 'number' && signer.page > 0) {
        try {
          const p = await pdfJsDoc.getPage(signer.page);
          const found = await findPhraseInPage(p, phrase);
          if (found) anchorPositions.set(si, { pageIndex: signer.page - 1, x: found.x, y: found.y, width: found.width, height: found.height });
        } catch (e) { /* ignore */ }
      } else {
        for (let p = 1; p <= pdfJsDoc.numPages; p++) {
          try {
            const pdoc = await pdfJsDoc.getPage(p);
            const found = await findPhraseInPage(pdoc, phrase);
            if (found) { anchorPositions.set(si, { pageIndex: p - 1, x: found.x, y: found.y, width: found.width, height: found.height }); break; }
          } catch (e) { /* ignore */ }
        }
      }
    }
  } catch (e) {
    // ignore pdfjs errors and try pdf2json CLI fallback below
  }

  // Try to locate missing anchors using pdf2json Node API first (faster and
  // often more reliable than pdfjs), then fall back to the CLI-based parser
  // which runs on a resaved PDF when required.
  const missing = [] as number[];
  for (let si = 0; si < signers.length; si++) if (signers[si] && signers[si].anchorPhrase && !anchorPositions.has(si)) missing.push(si);
  if (missing.length > 0) {
    // 1) Try pdf2json Node API on the in-memory buffer
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdf2jsonMod = require('pdf2json');
      const PDFParserCtor = pdf2jsonMod.default || pdf2jsonMod.PDFParser || pdf2jsonMod;
      const parser = new PDFParserCtor();
      const parsed: any = await new Promise((resolve, reject) => {
        parser.on('pdfParser_dataError', (err: any) => reject(err));
        parser.on('pdfParser_dataReady', (data: any) => resolve(data));
        try { parser.parseBuffer(inputBuf); } catch (pe) { reject(pe); }
      });
      const pagesJson = parsed?.Pages || parsed?.formImage?.Pages || [];
      for (const si of missing) {
        const signer = signers[si];
        if (!signer || !signer.anchorPhrase) continue;
        const phrase = String(signer.anchorPhrase || '').trim();
        if (!phrase) continue;
        const candidatePages = typeof signer.page === 'number' && signer.page > 0 ? [Math.min(pages.length - 1, signer.page - 1)] : pagesJson.map((p: any, i: number) => i);
        for (const pidx of candidatePages) {
          const pJson = pagesJson[pidx];
          if (!pJson || !Array.isArray(pJson.Texts)) continue;
          for (const t of pJson.Texts) {
            const runs = t.R || [];
            let raw = runs.map((r: any) => (r && r.T) ? String(r.T) : '').join('');
            try { raw = decodeURIComponent(raw); } catch (e) { }
            let normRaw = normalizeText(raw);
            const normPhrase = normalizeText(phrase);
            if (normRaw.indexOf(normPhrase) !== -1) {
              const pageJsonWidth = Number(pJson.Width) || 1;
              const pageJsonHeight = Number(pJson.Height) || 1;
              const scaleX = pages[pidx].getWidth() / pageJsonWidth;
              const scaleY = pages[pidx].getHeight() / pageJsonHeight;
              const ax = Number(t.x || 0) * scaleX;
              const ay = Number(t.y || 0) * scaleY;
              const aw = Number(t.w || 0) * scaleX;
              const top = pages[pidx].getHeight() - ay;
              anchorPositions.set(si, { pageIndex: pidx, x: ax, y: top, width: aw, height: 0 });
              break;
            }
          }
          if (anchorPositions.has(si)) break;
        }
      }
    } catch (e) {
      // ignore node-api failures and try CLI fallback below
    }

    // 2) Any remaining missing anchors -> use CLI-based pdf2json on a resaved PDF
    const stillMissing = [] as number[];
    for (let si = 0; si < signers.length; si++) if (signers[si] && signers[si].anchorPhrase && !anchorPositions.has(si)) stillMissing.push(si);
    if (stillMissing.length > 0) {
      try {
        // resave without object streams to improve parsing
        const resaved = await doc.save({ useObjectStreams: false });
        const parsed = await runPdf2jsonCliOnPdfBuffer(Buffer.from(resaved));
        const pagesJson = parsed?.Pages || parsed?.formImage?.Pages || [];
        for (const si of stillMissing) {
          const signer = signers[si];
          if (!signer || !signer.anchorPhrase) continue;
          const phrase = String(signer.anchorPhrase || '').trim();
          if (!phrase) continue;
          const candidatePages = typeof signer.page === 'number' && signer.page > 0 ? [Math.min(pages.length - 1, signer.page - 1)] : pagesJson.map((p: any, i: number) => i);
          for (const pidx of candidatePages) {
            const pJson = pagesJson[pidx];
            if (!pJson || !Array.isArray(pJson.Texts)) continue;
            for (const t of pJson.Texts) {
              const runs = t.R || [];
              let raw = runs.map((r: any) => (r && r.T) ? String(r.T) : '').join('');
              try { raw = decodeURIComponent(raw); } catch (e) { }
              let normRaw = normalizeText(raw);
              const normPhrase = normalizeText(phrase);
              if (normRaw.indexOf(normPhrase) !== -1) {
                const pageJsonWidth = Number(pJson.Width) || 1;
                const pageJsonHeight = Number(pJson.Height) || 1;
                const scaleX = pages[pidx].getWidth() / pageJsonWidth;
                const scaleY = pages[pidx].getHeight() / pageJsonHeight;
                const ax = Number(t.x || 0) * scaleX;
                const ay = Number(t.y || 0) * scaleY;
                const aw = Number(t.w || 0) * scaleX;
                const top = pages[pidx].getHeight() - ay;
                anchorPositions.set(si, { pageIndex: pidx, x: ax, y: top, width: aw, height: 0 });
                break;
              }
            }
            if (anchorPositions.has(si)) break;
          }
        }
      } catch (e) {
        // ignore pdf2json failures
      }
    }
  }

  try {
    // Draw appearances for every signer
    for (let si = 0; si < signers.length; si++) {
      const signer = signers[si];
      const pageIndex = typeof signer.page === 'number' && signer.page > 0 ? Math.min(pages.length - 1, signer.page - 1) : (anchorPositions.get(si)?.pageIndex ?? 0);
      const page = pages[pageIndex];
      if (!page) continue;

      // determine rect
      const providedRect = typeof signer.x === 'number' && typeof signer.y === 'number' && typeof signer.width === 'number' && typeof signer.height === 'number';
      let x: number, y: number, width: number, height: number;
      const defaultWidth = 180;
      const defaultHeight = 50;

      if (signer.anchorPhrase && anchorPositions.has(si)) {
        const a = anchorPositions.get(si)!;
        // clamp anchor-left to page and compute width within page bounds
        const pageWidth = page.getWidth();
        const anchorLeft = Math.max(0, a.x || 0);
        const anchorWidth = (a.width && a.width > 0) ? Math.min(a.width, Math.max(0, pageWidth - anchorLeft - 12)) : 0;
        width = typeof signer.width === 'number' ? signer.width : (anchorWidth > 0 ? anchorWidth : defaultWidth);
        height = typeof signer.height === 'number' ? signer.height : defaultHeight;
        // place 1cm below the anchor phrase (compute anchor top robustly)
        x = anchorLeft;
        const anchorTop = (a.y || 0) + (a.height || 0);
        const topOfBox = anchorTop - CM_IN_POINTS;
        y = Math.max(12, topOfBox - height);
      } else if (providedRect) {
        x = signer.x;
        y = signer.y;
        width = signer.width;
        height = signer.height;
      } else {
        // default placement: bottom-left with margin
        width = typeof signer.width === 'number' ? signer.width : defaultWidth;
        height = typeof signer.height === 'number' ? signer.height : defaultHeight;
        x = 36;
        y = 36;
      }

      // appearance
      const appearance = signer.appearance || {};
      const hex = typeof appearance.color === 'string' ? appearance.color : '#000000';
      const fontSize = typeof appearance.fontSize === 'number' ? appearance.fontSize : 12;
      const [r, g, b] = hexToRgb(hex);
      const color = rgb(r, g, b);

      // If anchorPhrase is used, do not draw a border (per requested behavior).
      const shouldDrawBorder = signer.anchorPhrase ? false : (typeof signer.drawBorder === 'boolean' ? signer.drawBorder : providedRect);
      if (shouldDrawBorder) {
        page.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: 0.5 });
      }

      // draw text lines inside the rect
      const nameText = signer.name ? String(signer.name) : '';
      const reasonText = signer.reason ? String(signer.reason) : '';
      const lines: string[] = [];
      if (nameText) lines.push(nameText);
      if (reasonText) lines.push(reasonText);
      lines.push(new Date().toISOString());

      const padding = signer.anchorPhrase ? 0 : 6;
      let textY = y + height - padding - fontSize;
      const textX = x + padding;
      for (const line of lines) {
        page.drawText(line, { x: textX, y: textY, size: fontSize, font, color });
        textY -= fontSize + 2;
      }
    }

    // save unsigned appearance-rendered PDF (no object streams to improve signing compatibility)
    const resaved = await doc.save({ useObjectStreams: false });
    let currentPdfBase64 = Buffer.from(resaved).toString('base64');

    // cryptographically sign sequentially
    for (const signer of signers) {
      const signBody: any = {
        ekycId: signer.ekycId,
        pdfBase64: currentPdfBase64,
        reason: signer.reason ?? undefined,
        location: signer.location ?? undefined,
        name: signer.name ?? undefined,
        contactInfo: signer.contactInfo ?? undefined,
      };
      const res = await signPdfP12PlainBase64(signBody);
      currentPdfBase64 = res.pdfBase64;
    }

    return { pdfBase64: currentPdfBase64 };
  } catch (e) {
    throw new AppError(500, 'SIGN_APPEARANCE_FAILED', 'Failed to render visible appearances or sign PDF', { error: (e as any)?.message ?? String(e) });
  }
}

// Very small verify implementation that counts ByteRange placeholders (signatures).
// This is not a full cryptographic verification, but is sufficient to report
// how many signatures exist in the PDF and can be extended later.
async function verifyPdfBase64(opts: { pdfBase64: string; details?: boolean }): Promise<any> {
  const { pdfBase64, details } = opts;
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'pdfBase64 is required');
  }

  const buf = Buffer.from(pdfBase64, 'base64');
  const text = buf.toString('latin1');

  const contentsHexRegex = /\/Contents\s*<([0-9A-Fa-f\s\r\n]+)>/g;
  const signatures: any[] = [];
  let match: RegExpExecArray | null;
  const forge = require('node-forge');
  const crypto = require('crypto');
  const securitySecret = process.env.SIGN_SECURITY_SECRET;

  const p12MetaMap: Record<string, { ekycId?: string; securityCode?: string }> = {};
  try {
    if (fsSync.existsSync(DEFAULT_P12_STORAGE)) {
      const metaFiles = fsSync.readdirSync(DEFAULT_P12_STORAGE).filter((f) => f.endsWith('.json'));
      for (const mf of metaFiles) {
        try {
          const raw = fsSync.readFileSync(path.join(DEFAULT_P12_STORAGE, mf), 'utf8');
          const j = JSON.parse(raw);
          if (j && j.fingerprint) {
            p12MetaMap[String(j.fingerprint).toLowerCase()] = { ekycId: j.ekycId, securityCode: j.securityCode };
          }
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore */ }

  let idx = 0;
  while ((match = contentsHexRegex.exec(text)) !== null) {
    idx += 1;
    const hex = (match[1] || '').replace(/\s+/g, '');
    if (!hex) continue;

    try {
      // Robust PKCS#7 parsing: some PDFs pad the signature contents with
      // trailing zero bytes to fill the placeholder. node-forge's ASN.1
      // parser can complain about "Unparsed DER bytes remain" in that case.
      // Strategy: try parsing as-is; if it fails, attempt to trim common
      // padding bytes (0x00, 0xff, 0x20) from the end and retry. As a
      // final fallback, try progressively trimming a few hundred bytes.
      const sigBuf = Buffer.from(hex, 'hex');

      const tryParse = (buffer: Buffer) => {
        try {
          const derBinary = buffer.toString('binary');
          const asn1 = forge.asn1.fromDer(derBinary);
          const p7 = forge.pkcs7.messageFromAsn1(asn1);
          return p7;
        } catch (err) {
          throw err;
        }
      };

      let p7: any | null = null;
      try {
        p7 = tryParse(sigBuf);
      } catch (firstErr) {
        // attempt to trim common padding bytes
        const paddedBytes = [0x00, 0xff, 0x20];
        let trimmed = Buffer.from(sigBuf);
        let trimmedOnce = false;
        for (let i = 0; i < trimmed.length && i < 4096; i++) {
          if (trimmed.length === 0) break;
          const last = trimmed[trimmed.length - 1];
          if (last === undefined) break;
          if (paddedBytes.includes(last)) {
            trimmed = trimmed.slice(0, trimmed.length - 1);
            trimmedOnce = true;
            try {
              p7 = tryParse(trimmed);
              break;
            } catch (_) {
              continue;
            }
          } else {
            break;
          }
        }

        // aggressive fallback: try progressively trimming up to 1024 bytes
        if (!p7) {
          const maxTrim = Math.min(1024, sigBuf.length - 1);
          for (let t = 1; t <= maxTrim; t++) {
            try {
              const cand = sigBuf.slice(0, sigBuf.length - t);
              p7 = tryParse(cand);
              if (p7) break;
            } catch (_) {
              // continue trying
            }
          }
        }

        if (!p7) {
          // give up and rethrow the original error message for visibility
          throw firstErr;
        }
      }

      const certInfos: any[] = [];
      const certs = (p7 && p7.certificates) || [];
      for (const cert of certs) {
        try {
          const serialNumber = cert.serialNumber;
          const pem = forge.pki.certificateToPem(cert);
          const asn1Cert = forge.pki.certificateToAsn1(cert);
          const derCert = forge.asn1.toDer(asn1Cert).getBytes();
          const sha = forge.md.sha256.create();
          sha.update(derCert);
          const fingerprint = sha.digest().toHex();

          let serverSigned = false;
          let extEkycId: string | undefined;
          const targetOid = '1.3.6.1.4.1.55555.1.2';
          if (Array.isArray(cert.extensions)) {
            for (const ext of cert.extensions) {
              try {
                if (ext && (ext.id === targetOid || ext.name === targetOid)) {
                  const extDer = ext.value;
                  try {
                    const innerAsn1 = forge.asn1.fromDer(extDer);
                    const payloadUtf8 = forge.util.decodeUtf8(innerAsn1.value);
                    const payload = JSON.parse(payloadUtf8);
                    if (payload && payload.ekycId) extEkycId = payload.ekycId;
                    if (payload && payload.ekycId && payload.code && securitySecret) {
                      const expected = crypto.createHmac('sha256', securitySecret).update(String(payload.ekycId)).digest('hex');
                      if (expected === payload.code) serverSigned = true;
                    }
                  } catch (ie) {
                    try {
                      const maybeHex = String(ext.value).replace(/\s+/g, '');
                      const raw = Buffer.from(maybeHex, 'hex').toString('binary');
                      const inner = forge.asn1.fromDer(raw);
                      const payloadUtf8 = forge.util.decodeUtf8(inner.value);
                      const payload = JSON.parse(payloadUtf8);
                      if (payload && payload.ekycId) extEkycId = payload.ekycId;
                      if (payload && payload.ekycId && payload.code && securitySecret) {
                        const expected = crypto.createHmac('sha256', securitySecret).update(String(payload.ekycId)).digest('hex');
                        if (expected === payload.code) serverSigned = true;
                      }
                    } catch (ie2) { /* ignore */ }
                  }
                }
              } catch (e) { /* ignore per-ext */ }
            }
          }

          const cnField = cert.subject.getField ? cert.subject.getField('CN') : undefined;
          const commonName = cnField ? cnField.value : undefined;

          try {
            const meta = p12MetaMap[String(fingerprint).toLowerCase()];
            if (meta && meta.ekycId) {
              if (!extEkycId) extEkycId = meta.ekycId;
              if (!serverSigned) serverSigned = true;
              if (meta.securityCode && securitySecret) {
                try {
                  const expected = crypto.createHmac('sha256', securitySecret).update(String(meta.ekycId)).digest('hex');
                  const serverSignedVerified = expected === meta.securityCode;
                  if (serverSignedVerified) (cert as any)._serverSignedVerified = true;
                } catch (ve) { /* ignore */ }
              }
            }
          } catch (metaErr) { /* ignore */ }

          const certInfo: any = { serialNumber, fingerprint, commonName, serverSigned, extEkycId, pem };
          if ((cert as any)._serverSignedVerified) certInfo.serverSignedVerified = true;
          certInfos.push(certInfo);
        } catch (e) { /* ignore cert parse errors */ }
      }

      const sigServerSigned = certInfos.some((c) => c.serverSigned);
      const sigEkycId = certInfos.find((c) => c.extEkycId && c.extEkycId.length) ? certInfos.find((c) => c.extEkycId && c.extEkycId.length).extEkycId : undefined;

      signatures.push({ index: idx, ekycId: sigEkycId, serverSigned: sigServerSigned, certs: certInfos });
    } catch (e) {
      signatures.push({ index: idx, error: (e as any)?.message ?? String(e) });
    }
  }

  const total = signatures.length;
  return { total, signatures };
}

// Public service API exported for other modules. Keep the low-level
// `signPdfP12PlainBase64` as an internal helper and expose the public
// wrapper `signPdfBase64` so callers do not depend on legacy internal names.
const pdfService = {
  signPdfBase64,
  signPdfVisibleBase64,
  verifyPdfBase64,
};

export default pdfService;

