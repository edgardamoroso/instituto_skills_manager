import { Router } from 'express';
import { getOverview } from '../services/overviewService.js';
import { requireAdmin } from '../middleware/auth.js';
import { wrap } from '../lib/http.js';

const router = Router();

router.get('/', requireAdmin, wrap((_request, response) => response.json(getOverview())));

export default router;
