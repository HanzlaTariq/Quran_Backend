import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import AdminSettings from './models/AdminSetting.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const createAdmin = async () => {
  try {
    const adminExists = await User.findOne({ email: 'xiro474747@gmail.com' });

    if (adminExists) {
      console.log('Admin already exists');
      return adminExists._id;
    }

    const admin = await User.create({
      name: 'Hanzla Tariq',
      email: 'xiro474747@gmail.com',
      password: '123456',
      role: 'admin',
      phone: '03106723232',
      country: 'Pakistan',
      timezone: 'Asia/Karachi',
    });
    console.log('Admin created:', admin.email);
    return admin._id;
  } catch (error) {
    console.error('Error creating admin:', error);
    return null;
  }
};

const createDefaultSettings = async (adminUserId) => {
  try {
    if (!adminUserId) {
      console.log('Admin user ID not available, skipping settings creation');
      return;
    }

    const settingsExists = await AdminSettings.findOne({ user: adminUserId });

    if (settingsExists) {
      console.log('Admin settings already exist');
      return;
    }

    const defaultSettings = await AdminSettings.create({
      user: adminUserId,
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

    console.log('Default admin settings created successfully');
  } catch (error) {
    console.error('Error creating default settings:', error);
  }
};

const seedData = async () => {
  try {
    console.log('Starting data seeding...');
    const adminUserId = await createAdmin();
    await createDefaultSettings(adminUserId);
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedData();