import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quranSettings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuranSettings',
    required: false
  },
  age: {
    type: Number,
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  currentCourse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  currentUlma: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ulma'
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  progress: {
    currentPara: {
      type: Number,
      min: 1,
      max: 30,
      default: 1
    },
    currentSurah: {
      type: String,
      default: 'Al-Fatiha'
    },
    ayatCompleted: {
      type: Number,
      default: 0
    },
    totalClasses: {
      type: Number,
      default: 0
    },
    attendancePercentage: {
      type: Number,
      default: 0
    }
  },
  preferences: {
    cameraOnByDefault: {
      type: Boolean,
      default: false
    },
    language: {
      type: String,
      default: 'english'
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    }
  },
  subscription: {
    isActive: {
      type: Boolean,
      default: false
    },
    currentPlan: {
      type: String,
      enum: ['basic', 'standard', 'premium']
    },
    monthlyFee: {
      type: Number,
      default: 0
    },
    nextBillingDate: Date,
    paymentHistory: [{
      date: Date,
      amount: Number,
      status: {
        type: String,
        enum: ['paid', 'pending', 'failed']
      },
      transactionId: String
    }]
  }
},{
  timestamps: true
});

export default mongoose.model('Student', studentSchema);