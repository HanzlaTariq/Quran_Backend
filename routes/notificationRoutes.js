import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification
} from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.post('/', createNotification); // Protected by role in controller

export default router;