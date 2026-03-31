import mongoose from 'mongoose';

const quranSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // 📖 Translation settings
  translation: {
    language: {
      type: String,
      default: 'en' // ur, en, ar etc
    },
    translator: {
      type: String,
      default: 'Sahih International'
    },
    enabled: {
      type: Boolean,
      default: true
    }
  },

  // 📚 Tafseer settings
  tafseer: {
    enabled: {
      type: Boolean,
      default: false
    },
    tafseerName: {
      type: String,
      default: 'Ibn Kathir'
    }
  },

  // 🔤 Font settings
  font: {
    arabicSize: {
      type: Number,
      default: 22
    },
    translationSize: {
      type: Number,
      default: 16
    },
    fontFamily: {
      type: String,
      default: 'Uthmani'
    }
  },

  // 🎧 Audio settings
  audio: {
    reciter: {
      type: String,
      default: 'Abdul Basit'
    },
    autoPlay: {
      type: Boolean,
      default: false
    }
  },

  // 🌙 Reading preferences
  readingMode: {
    showArabic: {
      type: Boolean,
      default: true
    },
   
    showAyahNumber: {
      type: Boolean,
      default: true
    }
  }

}, { timestamps: true });

export default mongoose.model('QuranSettings', quranSettingsSchema);