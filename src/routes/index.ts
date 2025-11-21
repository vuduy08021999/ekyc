import { Router } from 'express';
import { ocrRouter } from '../modules/ocr/ocr.routes';
import { faceRouter } from '../modules/face/face.routes';

export const apiRouter = Router();

apiRouter.use('/ocr', ocrRouter);
apiRouter.use('/face', faceRouter);
