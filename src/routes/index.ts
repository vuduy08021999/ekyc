import { Router } from 'express';
import { ocrRouter } from '../modules/ocr/ocr.routes';
import { faceRouter } from '../modules/face/face.routes';
import { signatureRouter } from '../modules/signature/signature.routes';
import pdfRouter from '../modules/pdf/pdf.routes';
import config from '../config';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
	res.status(200).json({
		status: 'UP',
		env: config.env,
		uptimeSeconds: Math.floor(process.uptime()),
		timestamp: new Date().toISOString(),
	});
});

apiRouter.use('/ocr', ocrRouter);
apiRouter.use('/face', faceRouter);
apiRouter.use('/signature', signatureRouter);
apiRouter.use('/pdf', pdfRouter);
