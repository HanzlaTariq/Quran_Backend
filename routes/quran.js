import express from 'express';
import { getSurahs, getSurah, getAyah, searchQuran } from '../controllers/quranController.js';
import { protect } from '../middleware/auth.js';
import { getQuranSettings, updateQuranSettings } from '../controllers/quranController.js';

const router = express.Router();

router.get('/surah', getSurahs);
router.get('/surah/:surahNumber/:edition', getSurah);
router.get('/ayah/:surahNumber/:ayahNumber', getAyah);
router.get('/search', searchQuran);

// Quran Settings Routes (Protected)
router.get('/settings/:userId', protect, getQuranSettings);
router.put('/settings/:userId', protect, updateQuranSettings);

export default router;
