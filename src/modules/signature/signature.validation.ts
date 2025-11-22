import { z } from 'zod';

export const createP12Schema = z.object({
  ekycId: z.string().min(1).regex(/^[A-Za-z0-9_-]{1,128}$/),
  overwrite: z.boolean().optional(),
  subject: z.object({
    commonName: z.string().optional(),
    email: z.string().optional(),
    organizationName: z.string().optional(),
    countryName: z.string().optional(),
    stateOrProvinceName: z.string().optional(),
    localityName: z.string().optional(),
  }).optional(),
  daysValid: z.number().int().positive().optional(),
  requestId: z.string().optional(),
}).refine((val) => (val as any).passphrase === undefined, {
  message: 'passphrase must not be provided; server manages P12 passphrase centrally',
  path: ['passphrase'],
});

export const listQuerySchema = z.object({
  prefix: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  details: z.coerce.boolean().optional(),
});
