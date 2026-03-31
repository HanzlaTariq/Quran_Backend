import express from 'express';
import {
  getQaris,
  bookSession,
  getMySessions,
  updateSessionStatus,
} from '../controllers/liveClassController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/qaris', getQaris);
router.post('/book', protect, bookSession);
router.get('/my-sessions', protect, getMySessions);
router.put('/sessions/:id/status', protect, updateSessionStatus);

export default router;
