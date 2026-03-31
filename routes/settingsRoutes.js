import express from 'express';
import { getPublicSystemSettings } from '../controllers/settings.controller.js';

const router = express.Router();

router.get('/public', getPublicSystemSettings);

export default router;
