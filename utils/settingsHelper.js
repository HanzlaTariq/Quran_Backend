import AdminSettings from '../models/AdminSetting.js';

let cachedSettings = null;
let cacheExpiry = null;
const CACHE_DURATION = 60000; // 1 minute cache

/**
 * Get system settings with caching
 * @param {boolean} forceRefresh - Force refresh from database
 * @returns {Object} System settings
 */
export const getSystemSettings = async (forceRefresh = false) => {
  const now = Date.now();

  // Return cached settings if available and not expired
  if (cachedSettings && cacheExpiry && now < cacheExpiry && !forceRefresh) {
    return cachedSettings;
  }

  try {
    const settings = await AdminSettings.findOne().sort({ updatedAt: -1 });

    if (!settings) {
      throw new Error('No admin settings found');
    }

    // Update cache
    cachedSettings = settings;
    cacheExpiry = now + CACHE_DURATION;

    return settings;
  } catch (error) {
    console.error('Error fetching system settings:', error);
    // Return default settings on error
    return {
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
    };
  }
};

/**
 * Get specific setting value
 * @param {string} category - Settings category (general, payment, classes, notifications, security)
 * @param {string} key - Setting key
 * @returns {any} Setting value
 */
export const getSetting = async (category, key) => {
  try {
    const settings = await getSystemSettings();
    return settings[category]?.[key];
  } catch (error) {
    console.error(`Error fetching setting ${category}.${key}:`, error);
    return null;
  }
};

/**
 * Clear settings cache
 */
export const clearSettingsCache = () => {
  cachedSettings = null;
  cacheExpiry = null;
};

/**
 * Check if maintenance mode is enabled
 * @returns {boolean}
 */
export const isMaintenanceMode = async () => {
  try {
    return await getSetting('general', 'maintenanceMode');
  } catch (error) {
    return false;
  }
};

/**
 * Get payment settings
 * @returns {Object} Payment settings
 */
export const getPaymentSettings = async () => {
  try {
    const settings = await getSystemSettings();
    return settings.payment;
  } catch (error) {
    return null;
  }
};

/**
 * Get class settings
 * @returns {Object} Class settings
 */
export const getClassSettings = async () => {
  try {
    const settings = await getSystemSettings();
    return settings.classes;
  } catch (error) {
    return null;
  }
};

/**
 * Get security settings
 * @returns {Object} Security settings
 */
export const getSecuritySettings = async () => {
  try {
    const settings = await getSystemSettings();
    return settings.security;
  } catch (error) {
    return null;
  }
};

/**
 * Get notification settings
 * @returns {Object} Notification settings
 */
export const getNotificationSettings = async () => {
  try {
    const settings = await getSystemSettings();
    return settings.notifications;
  } catch (error) {
    return null;
  }
};
