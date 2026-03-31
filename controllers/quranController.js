import axios from 'axios';
import asyncHandler from 'express-async-handler';
import QuranSettings from '../models/Quran.js';

// @desc    Get all surahs
// @route   GET /api/quran/surahs
// @access  Public
const getSurahs = asyncHandler(async (req, res) => {
  const response = await axios.get('https://api.alquran.cloud/v1/surah');
  res.json(response.data);
});

// @desc    Get specific surah with translation
// @route   GET /api/quran/surahs/:surahNumber/:edition
// @access  Public
const getSurah = asyncHandler(async (req, res) => {
  const { surahNumber, edition } = req.params;
  const response = await axios.get(`https://api.alquran.cloud/v1/surah/${surahNumber}/${edition}`);
  res.json(response.data);
});

// @desc    Get specific ayah
// @route   GET /api/quran/ayah/:surahNumber/:ayahNumber
// @access  Public
const getAyah = asyncHandler(async (req, res) => {
  const { surahNumber, ayahNumber } = req.params;
  const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${surahNumber}:${ayahNumber}`);
  res.json(response.data);
});

// @desc    Search Quran
// @route   GET /api/quran/search
// @access  Public
const searchQuran = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const response = await axios.get(`https://api.alquran.cloud/v1/search/${q}/all/en`);
  res.json(response.data);
});

// @desc    Get user's Quran settings
// @route   GET /api/quran-settings/:userId
// @access  Private
export const getQuranSettings = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access these settings'
    });
  }
  
  let settings = await QuranSettings.findOne({ user: userId });
  
  if (!settings) {
    // Create default settings if not found
    settings = await QuranSettings.create({ user: userId });
  }
  
  res.json(settings);
});

// @desc    Update user's Quran settings
// @route   PUT /api/quran-settings/:userId
// @access  Private
export const updateQuranSettings = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { translation, tafseer, font, audio, readingMode } = req.body;

  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update these settings'
    });
  }
  
  let settings = await QuranSettings.findOne({ user: userId });
  
  if (!settings) {
    settings = await QuranSettings.create({ user: userId });
  }
  
  // Update only provided fields
  if (translation) {
    settings.translation = { ...settings.translation, ...translation };
  }
  if (tafseer) {
    settings.tafseer = { ...settings.tafseer, ...tafseer };
  }
  if (font) {
    settings.font = { ...settings.font, ...font };
  }
  if (audio) {
    settings.audio = { ...settings.audio, ...audio };
  }
  if (readingMode) {
    settings.readingMode = { ...settings.readingMode, ...readingMode };
  }
  
  await settings.save();
  
  res.json(settings);
});

export { getSurahs, getSurah, getAyah, searchQuran };