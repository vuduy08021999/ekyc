import { Router } from 'express';
import { validateBody } from '../../middleware/validation';
import { createSuccessResponse } from '../../common/dto/api-response.dto';
import pdfService from './pdf.service';
import { signPdfSchema, visibleSignSchema, verifyPdfSchema } from './pdf.validation';

export const pdfRouter = Router();

// Invisible sign
pdfRouter.post('/sign', validateBody(signPdfSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const result = await pdfService.signPdfBase64(body);
    res.status(200).json(createSuccessResponse(result, 'OK', 'PDF signed'));
  } catch (err) {
    next(err);
  }
});

// Visible sign
pdfRouter.post('/sign/visible', validateBody(visibleSignSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const result = await pdfService.signPdfVisibleBase64(body);
    res.status(200).json(createSuccessResponse(result, 'OK', 'PDF signed (visible)'));
  } catch (err) {
    next(err);
  }
});

// Verify
pdfRouter.post('/verify', validateBody(verifyPdfSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const result = await pdfService.verifyPdfBase64({ pdfBase64: body.pdfBase64, details: body.details });
    res.status(200).json(createSuccessResponse(result, 'OK', 'Verify result'));
  } catch (err) {
    next(err);
  }
});

export default pdfRouter;
