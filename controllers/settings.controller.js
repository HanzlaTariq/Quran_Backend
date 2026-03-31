import asyncHandler from 'express-async-handler';
import AdminSettings from '../models/AdminSetting.js';

const defaultSettings = {
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
};

// @desc    Get public system settings
// @route   GET /api/settings/public
// @access  Public
export const getPublicSystemSettings = asyncHandler(async (req, res) => {
  const settings = await AdminSettings.findOne().sort({ updatedAt: -1 }).lean();

  if (!settings) {
    return res.json(defaultSettings);
  }

  return res.json({
    general: settings.general || defaultSettings.general,
    payment: settings.payment || defaultSettings.payment,
    classes: settings.classes || defaultSettings.classes,
    notifications: settings.notifications || defaultSettings.notifications,
  });
});
