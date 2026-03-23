import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'zkpay-backend',
    timestamp: new Date().toISOString(),
  });
});

export default router;
