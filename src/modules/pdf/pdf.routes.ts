import { Router } from 'express';
import { validateBody } from '../../middleware/validation';
import { createSuccessResponse } from '../../common/dto/api-response.dto';
import pdfService from './pdf.service';
import { signPdfSchema, verifyPdfSchema, signVisibleSchema, findAnchorSchema } from './pdf.validation';

export const pdfRouter = Router();

// Invisible sign
pdfRouter.post('/sign', validateBody(signPdfSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const requestId = (req as any).requestId as string | undefined;
    const result = await pdfService.signPdfBase64(body);
    res.status(200).json(createSuccessResponse(result, 'OK', 'PDF signed', requestId));
  } catch (err) {
    next(err);
  }
});
 
 
 
// Verify
pdfRouter.post('/verify', validateBody(verifyPdfSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const requestId = (req as any).requestId as string | undefined;
    const result = await pdfService.verifyPdfBase64({ pdfBase64: body.pdfBase64, details: body.details });
    res.status(200).json(createSuccessResponse(result, 'OK', 'Verify result', requestId));
  } catch (err) {
    next(err);
  }
});

// Find anchor phrase coordinates
pdfRouter.post('/find-anchor', validateBody(findAnchorSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const requestId = (req as any).requestId as string | undefined;
    const result = await pdfService.findAnchorPhraseBase64({ pdfBase64: body.pdfBase64, anchorPhrase: body.anchorPhrase, page: body.page });
    res.status(200).json(createSuccessResponse(result, 'OK', 'Anchor phrase search result', requestId));
  } catch (err) {
    next(err);
  }
});

// Visible sign (multiple signers supported)
// Provide the route as /sign/visible to match existing tests/clients
pdfRouter.post('/sign/visible', validateBody(signVisibleSchema), async (req, res, next) => {
  try {
    const body = req.body as any;
    const requestId = (req as any).requestId as string | undefined;
    const result = await pdfService.signPdfVisibleBase64(body);
    res.status(200).json(createSuccessResponse(result, 'OK', 'PDF visible-signed', requestId));
  } catch (err) {
    next(err);
  }
});

export default pdfRouter;
