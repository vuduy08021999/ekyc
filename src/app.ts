import express from 'express';
import config from './config';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { apiRouter } from './routes';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

app.use('/api', apiRouter);

app.use((req, res) => {
  res.status(200).json({
    status: 'CLIENT_ERROR',
    code: 'NOT_FOUND',
    message: 'Route not found',
    data: null,
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

export default app;
