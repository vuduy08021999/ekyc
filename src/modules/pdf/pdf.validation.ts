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

export const visibleSignSchema = signPdfSchema.extend({
  // placementMode: 'rect' uses rect, 'anchor' uses anchor
  placementMode: z.enum(['rect', 'anchor']).optional().default('rect'),
  rect: z.object({
    page: z.coerce.number().int().min(1).optional(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  anchor: z.object({
    page: z.coerce.number().int().min(1).optional(),
    phrase: z.string().min(1),
    occurrence: z.enum(['first','last','nth']).optional().default('first'),
    nth: z.coerce.number().int().min(1).optional(),
    alignment: z.enum(['below','above','left','right','center']).optional().default('below'),
    xOffset: z.number().optional(),
    yOffset: z.number().optional(),
    fallbackToDefault: z.boolean().optional().default(false),
  }).optional(),
  appearance: z.object({
    color: z.string().regex(COLOR_RE).optional().default('#000000'),
    fontSize: z.number().positive().optional().default(10),
    fontFamily: z.string().optional().default('Helvetica'),
    bold: z.boolean().optional().default(false),
    padding: z.number().nonnegative().optional().default(4),
    showName: z.boolean().optional().default(true),
    showReason: z.boolean().optional().default(true),
  }).optional(),
});

export const verifyPdfSchema = z.object({
  pdfBase64: z.string().min(1).refine((s) => {
    try { return Buffer.from(s, 'base64').length <= 20 * 1024 * 1024; } catch { return false; }
  }, { message: 'pdfBase64 must be valid base64 and <= 20MB' }),
  details: z.boolean().optional(),
  requestId: z.string().optional(),
});
