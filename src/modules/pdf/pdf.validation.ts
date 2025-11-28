import { z } from 'zod';

const EKYC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

export const signPdfSchema = z.object({
  ekycId: z.string().regex(EKYC_ID_RE),
  pdfBase64: z.string().min(1).refine((s) => {
    try {
      const b = Buffer.from(s, 'base64');
      return b.length <= 20 * 1024 * 1024; // 20MB
    } catch (e) {
      return false;
    }
  }, { message: 'pdfBase64 must be valid base64 and <= 20MB' }),
  reason: z.string().optional(),
  location: z.string().optional(),
  name: z.string().optional(),
  contactInfo: z.string().optional(),
  requestId: z.string().optional(),
});

 
export const verifyPdfSchema = z.object({
  pdfBase64: z.string().min(1).refine((s) => {
    try { return Buffer.from(s, 'base64').length <= 20 * 1024 * 1024; } catch { return false; }
  }, { message: 'pdfBase64 must be valid base64 and <= 20MB' }),
  details: z.boolean().optional(),
  requestId: z.string().optional(),
});

export const signVisibleSchema = z.object({
  pdfBase64: z.string().min(1).refine((s) => {
    try { return Buffer.from(s, 'base64').length <= 20 * 1024 * 1024; } catch { return false; }
  }, { message: 'pdfBase64 must be valid base64 and <= 20MB' }),
  // signers: array of objects describing each visible signer and optional positioning
  // NOTE: only multiple signers supported now (legacy single-signer fields removed)
  signers: z.array(z.object({
    ekycId: z.string().regex(EKYC_ID_RE),
    page: z.number().int().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    // anchorPhrase: if provided, server will locate this phrase and place the signature
    // 1cm below the phrase. When anchorPhrase is present, explicit x/y coordinates are ignored.
    anchorPhrase: z.string().optional(),
    // whether to draw a visible border for this signer (if omitted, border is drawn
    // only when x/y/width/height are explicitly provided)
    drawBorder: z.boolean().optional(),
    reason: z.string().optional(),
    location: z.string().optional(),
    name: z.string().optional(),
    contactInfo: z.string().optional(),
    appearance: z.object({ color: z.string().regex(COLOR_RE).optional(), fontSize: z.number().optional() }).optional(),
  })).min(1),
  requestId: z.string().optional(),
});
