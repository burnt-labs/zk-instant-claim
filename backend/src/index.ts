import express from 'express';
import cors from 'cors';
import { config } from './config';
import claimRouter from './routes/claim';
import healthRouter from './routes/health';

const app = express();

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/claim', claimRouter);

app.listen(config.port, () => {
  console.log(`ZKPay backend running on http://localhost:${config.port}`);
  console.log(`CORS allowed for: ${config.frontendUrl}`);
  console.log(`Contract: ${config.xion.contractAddress}`);
});

export default app;
