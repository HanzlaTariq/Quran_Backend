import asyncHandler from 'express-async-handler';
import Announcement from '../../models/Announcement.js';
import AdminSettings from '../../models/AdminSetting.js';
import { clearSettingsCache } from '../../utils/settingsHelper.js';

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Private/Admin
export const getSystemSettings = asyncHandler(async (req, res) => {
  let settings = await AdminSettings.findOne({ user: req.user.id });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await AdminSettings.create({
      user: req.user.id,
      general: {
        siteName: 'Quran Academy',
        siteUrl: 'https://quranacademy.com',
        contactEmail: 'support@quranacademy.com',
        contactPhone: '+923001234567',
        timezone: 'Asia/Karachi',
        defaultLanguage: 'english',
        maintenanceMode: false,
      },
      payment: {
        currency: 'USD',
        paymentMethods: ['card', 'bank', 'easypaisa', 'jazzcash'],
        taxRate: 0,
        lateFee: 10,
        gracePeriod: 7,
        autoRenewal: true,
      },
      classes: {
        defaultDuration: 60,
        maxStudentsPerUlma: 20,
        cancellationWindow: 24,
        rescheduleLimit: 2,
        recordingRetention: 30,
        classBufferTime: 15,
      },
      notifications: {
        classReminder: true,
        paymentReminder: true,
        announcementEmail: true,
        smsNotifications: false,
        pushNotifications: true,
        emailNotifications: true,
      },
      security: {
        sessionTimeout: 30,
        maxLoginAttempts: 5,
        passwordExpiry: 90,
        twoFactorAuth: false,
        ipWhitelist: [],
        forceLogout: false,
      },
    });
  }

  res.json(settings);
});

// @desc    Update system settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
export const updateSystemSettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  let updatedSettings = await AdminSettings.findOneAndUpdate(
    { user: req.user.id },
    {
      user: req.user.id,
      general: settings.general,
      payment: settings.payment,
      classes: settings.classes,
      notifications: settings.notifications,
      security: settings.security,
    },
    { new: true, upsert: true }
  );

  clearSettingsCache();

  res.json({
    success: true,
    message: 'Settings updated successfully',
    data: updatedSettings,
  });
});

// @desc    Send announcement
// @route   POST /api/admin/announcements
// @access  Private/Admin
export const sendAnnouncement = asyncHandler(async (req, res) => {
  const { title, message, targetRoles, isImportant } = req.body;

  if (!title || !message) {
    res.status(400);
    throw new Error('Title and message are required');
  }

  const announcement = await Announcement.create({
    title,
    message,
    targetRoles: targetRoles || ['student', 'ulma', 'admin'],
    isImportant: isImportant || false,
    sentBy: req.user.id,
  });

  res.json({
    success: true,
    message: 'Announcement sent successfully',
    announcement,
  });
});

// @desc    Get announcements
// @route   GET /api/admin/announcements
// @access  Private/Admin
export const getAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find()
    .populate('sentBy', 'name')
    .sort({ createdAt: -1 });

  res.json(announcements);
});

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private/Admin
export const getSystemLogs = asyncHandler(async (req, res) => {
  const { type, level, startDate, endDate, page = 1, limit = 50 } = req.query;

  let query = {};

  if (type) {
    query.type = type;
  }

  if (level) {
    query.level = level;
  }

  if (startDate && endDate) {
    query.timestamp = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  // Mock data - replace with actual logs collection
  const logs = [
    {
      id: 1,
      timestamp: new Date(),
      level: 'info',
      type: 'user',
      message: 'User logged in successfully',
      user: 'admin@example.com',
      ip: '192.168.1.1',
    },
    // ... more logs
  ];

  const total = logs.length;

  res.json({
    logs: logs.slice((page - 1) * limit, page * limit),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});