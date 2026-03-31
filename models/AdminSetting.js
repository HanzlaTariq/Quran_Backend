import mongoose from "mongoose";

const adminSettingsSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  general: {
    siteName: { type: String, default: "Quran Academy" },
    siteUrl: { type: String, default: "https://quranacademy.com" },
    contactEmail: { type: String, default: "support@quranacademy.com" },
    contactPhone: { type: String, default: "+923001234567" },
    timezone: { type: String, default: "Asia/Karachi" },
    defaultLanguage: { type: String, default: "english", enum: ["english", "urdu", "arabic"] },
    maintenanceMode: { type: Boolean, default: false }
  },

  payment: {
    currency: { type: String, default: "USD", enum: ["USD", "PKR", "EUR", "GBP"] },
    monthlyFee: { type: Number, default: 50 },
    paymentMethods: { type: [String], default: ["card", "bank", "easypaisa", "jazzcash"] },
    taxRate: { type: Number, default: 0 },
    lateFee: { type: Number, default: 10 },
    gracePeriod: { type: Number, default: 7 },
    autoRenewal: { type: Boolean, default: true }
  },

  classes: {
    defaultDuration: { type: Number, default: 60 },
    maxStudentsPerUlma: { type: Number, default: 20 },
    cancellationWindow: { type: Number, default: 24 },
    rescheduleLimit: { type: Number, default: 2 },
    recordingRetention: { type: Number, default: 30 },
    classBufferTime: { type: Number, default: 15 }
  },

  notifications: {
    classReminder: { type: Boolean, default: true },
    paymentReminder: { type: Boolean, default: true },
    announcementEmail: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    pushNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true }
  },

  security: {
    sessionTimeout: { type: Number, default: 30 },
    maxLoginAttempts: { type: Number, default: 5 },
    passwordExpiry: { type: Number, default: 90 },
    twoFactorAuth: { type: Boolean, default: false },
    ipWhitelist: { type: [String], default: [] },
    forceLogout: { type: Boolean, default: false }
  }

}, { timestamps: true });

export default mongoose.model("AdminSettings", adminSettingsSchema);