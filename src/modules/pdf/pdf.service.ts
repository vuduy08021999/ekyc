import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';
import crypto from 'crypto';
const forge: any = require('node-forge');
const { SignPdf } = require('node-signpdf');
// helpers may be in this module
const helpers: any = require('node-signpdf/dist/helpers');
const plainAddPlaceholder = helpers.plainAddPlaceholder || helpers.plainAddPlaceholder?.default || helpers.pdfkitAddPlaceholder;

import { findPhrasePosition } from './pdf.utils';

const DEFAULT_STORAGE = process.env.P12_STORAGE_DIR || path.resolve(__dirname, '../../../storage/p12');
const EKYC_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export class PdfService {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE;
  }

  private async ensureStorage() {
    if (!fsSync.existsSync(this.storageDir)) {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  private validateEkycId(ekycId: string) {
    if (!ekycId || typeof ekycId !== 'string') throw new Error('ekycId required');
    if (!EKYC_ID_REGEX.test(ekycId)) throw new Error('ekycId invalid');
  }

  private async readP12AndMeta(ekycId: string) {
    await this.ensureStorage();
    const p12Path = path.join(this.storageDir, `${ekycId}.p12`);
    const metaPath = path.join(this.storageDir, `${ekycId}.json`);
    if (!fsSync.existsSync(p12Path)) throw new Error('P12 not found');
    const p12buf = await fs.readFile(p12Path);
    let meta: any = null;
    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      meta = JSON.parse(raw);
    } catch (e) {
      meta = null;
    }
    return { p12buf, meta, p12Path };
  }

  private async signBufferWithP12(pdfBuffer: Buffer, p12buf: Buffer, passphrase: string, options: any = {}) {
    // prepare placeholder (use pdf-lib to preserve content)
    const prepared = await (async () => {
      try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
        const placeholder = plainAddPlaceholder({
          pdfBuffer: Buffer.from(pdfBytes),
          reason: options.reason || 'Document signed',
          location: options.location || '',
          name: options.name || '',
          contactInfo: options.contactInfo || '',
          signatureLength: options.signatureLength || 16100,
        });
        return placeholder;
      } catch (e) {
        throw e;
      }
    })();

    const signer = new SignPdf();
    const signed = signer.sign(prepared, p12buf, { passphrase });
    return signed as Buffer;
  }

  async signPdfBase64(opts: { ekycId: string; pdfBase64: string; reason?: string; location?: string; name?: string; contactInfo?: string; requestId?: string }) {
    const { ekycId, pdfBase64, reason, location, name, contactInfo } = opts;
    this.validateEkycId(ekycId);
    const { p12buf, meta } = await this.readP12AndMeta(ekycId);
    const passphrase = process.env.SIGN_P12_PASSPHRASE || 'changeit';
    const pdfBuf = Buffer.from(pdfBase64, 'base64');
    const signed = await this.signBufferWithP12(pdfBuf, p12buf, passphrase, { reason, location, name, contactInfo });

    // compute signatures info from p12 meta if exists
    const signatures: any[] = [];
    if (meta) {
      signatures.push({ serialNumber: meta.serialNumber, fingerprint: meta.fingerprint, ekycId: meta.ekycId ?? ekycId, serverSigned: !!meta.securityCode, signedAt: new Date().toISOString() });
    }

    return { pdfBase64: signed.toString('base64'), signatures };
  }

  private async applyVisibleAppearance(pdfBuffer: Buffer, rect: { page?: number; x: number; y: number; width: number; height: number }, appearance: any) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageIndex = Math.max(0, (rect.page || 1) - 1);
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) throw new Error('INVALID_RECT');
    const page = pdfDoc.getPage(pageIndex);
    const color = appearance?.color || '#000000';
    const fontSize = appearance?.fontSize || 10;
    const padding = appearance?.padding || 4;
    const showName = appearance?.showName !== false;
    const showReason = appearance?.showReason !== false;

    // convert hex color to rgb
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0,2),16)/255;
    const g = parseInt(hex.substring(2,4),16)/255;
    const b = parseInt(hex.substring(4,6),16)/255;

    // draw rectangle border
    page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderColor: rgb(r,g,b), borderWidth: 1 });

    // draw text lines
    const lines: string[] = [];
    if (showName && appearance?.name) lines.push(`Signed by: ${appearance.name}`);
    if (showReason && appearance?.reason) lines.push(`Reason: ${appearance.reason}`);
    lines.push(new Date().toISOString().substring(0,10));

    const lineHeight = fontSize + 2;
    let textY = rect.y + rect.height - padding - fontSize;
    for (const line of lines) {
      page.drawText(line, { x: rect.x + padding, y: textY, size: fontSize, color: rgb(r,g,b) });
      textY -= lineHeight;
    }

    const updated = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
    return Buffer.from(updated);
  }

  async signPdfVisibleBase64(opts: { ekycId: string; pdfBase64: string; placementMode?: 'rect'|'anchor'; rect?: any; anchor?: any; appearance?: any; name?: string; reason?: string; requestId?: string }) {
    const { ekycId, pdfBase64, placementMode = 'rect', rect, anchor, appearance = {} } = opts;
    this.validateEkycId(ekycId);
    const pdfBuf = Buffer.from(pdfBase64, 'base64');

    let chosenRect: any = null;
    if (placementMode === 'rect') {
      if (!rect) throw new Error('INVALID_RECT');
      chosenRect = rect;
    } else {
      // anchor
      if (!anchor || !anchor.phrase) throw new Error('ANCHOR_REQUIRED');
      const pos = await findPhrasePosition(pdfBuf, anchor.phrase, { page: anchor.page, occurrence: anchor.occurrence, nth: anchor.nth });
      if (!pos) {
        if (anchor.fallbackToDefault) {
          // set default rect: bottom-right
          chosenRect = { page: anchor.page || 1, x: 400, y: 40, width: 180, height: 60 };
        } else {
          throw new Error('ANCHOR_NOT_FOUND');
        }
      } else {
        // place below the phrase
        const w = anchor.width || 180;
        const h = anchor.height || 60;
        let x = pos.x;
        let y = pos.y - h - (anchor.yOffset || 8);
        if (anchor.alignment === 'right') x = pos.x + pos.width - w;
        if (anchor.alignment === 'center') x = pos.x + (pos.width - w) / 2;
        chosenRect = { page: pos.page, x, y, width: w, height: h };
      }
    }

    // apply appearance overlay (draw text/border into PDF)
    const appearanceOpts = Object.assign({}, appearance, { name: opts.name, reason: opts.reason });
    const pdfWithAppearance = await this.applyVisibleAppearance(pdfBuf, chosenRect, appearanceOpts);

    // sign
    const { p12buf, meta } = await this.readP12AndMeta(ekycId);
    const passphrase = process.env.SIGN_P12_PASSPHRASE || 'changeit';
    const signed = await this.signBufferWithP12(pdfWithAppearance, p12buf, passphrase, { reason: appearanceOpts.reason, location: '', name: appearanceOpts.name, contactInfo: '' });

    const signatures: any[] = [];
    if (meta) signatures.push({ serialNumber: meta.serialNumber, fingerprint: meta.fingerprint, ekycId: meta.ekycId ?? ekycId, serverSigned: !!meta.securityCode, signedAt: new Date().toISOString() });

    return { pdfBase64: signed.toString('base64'), signatures };
  }

  // Extract hex contents from PDF and return buffers
  private extractSignatureBlobs(pdfBuf: Buffer): Buffer[] {
    const pdf = pdfBuf.toString('binary');
    const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
    const contentsRegex = /\/Contents\s*<([0-9A-Fa-f\n\r\t ]+)>/g;
    const blobs: Buffer[] = [];
    let match;
    while ((match = byteRangeRegex.exec(pdf)) !== null) {
      const startSearch = byteRangeRegex.lastIndex;
      contentsRegex.lastIndex = startSearch;
      const cmatch = contentsRegex.exec(pdf);
      if (cmatch && cmatch[1]) {
        const hex = cmatch[1].replace(/\s+/g, '');
        try {
          const buf = Buffer.from(hex, 'hex');
          blobs.push(buf);
        } catch (e) {
          // ignore
        }
      }
    }
    return blobs;
  }

  async verifyPdfBase64(opts: { pdfBase64: string; details?: boolean }) {
    const { pdfBase64, details = false } = opts;
    const pdfBuf = Buffer.from(pdfBase64, 'base64');
    const blobs = this.extractSignatureBlobs(pdfBuf);
    const results: any[] = [];
    const securitySecret = process.env.SIGN_SECURITY_SECRET;
    for (const blob of blobs) {
      try {
        const asn1 = forge.asn1.fromDer(blob.toString('binary'));
        const p7 = forge.pkcs7.messageFromAsn1(asn1);
        const certs = p7.certificates || [];
        if (certs.length > 0) {
          const cert = certs[0];
          const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
          const sha256 = forge.md.sha256.create();
          sha256.update(der);
          const fingerprint = sha256.digest().toHex();
          const serialNumber = cert.serialNumber;
          let serverSigned = false;
          let ekycId: string | null = null;
          // check extension
          const ext = (cert.extensions || []).find((e: any) => e.id === '1.3.6.1.4.1.55555.1.2');
          if (ext && securitySecret) {
            try {
              const extAsn = forge.asn1.fromDer(ext.value);
              const json = forge.util.decodeUtf8(extAsn.value);
              const obj = JSON.parse(json);
              const expected = crypto.createHmac('sha256', securitySecret).update(obj.ekycId).digest('hex');
              if (expected === obj.code) {
                serverSigned = true;
                ekycId = obj.ekycId;
              }
            } catch (e) {
              // ignore
            }
          }
          results.push({ serialNumber, fingerprint, serverSigned, ekycId, signerSubject: cert.subject.attributes, details: details ? { certPem: forge.pki.certificateToPem(cert) } : undefined });
        }
      } catch (e) {
        // skip
      }
    }
    return { total: results.length, signatures: results };
  }
}

export default new PdfService();
