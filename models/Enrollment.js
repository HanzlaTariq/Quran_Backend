import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    // 🔗 Core Relations
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    ulma: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ulma',
      required: true,
    },

    // 📘 Course Info
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course', // Make sure you have a Course model
      required: true,
    },

    // 👨‍👩‍👧 Siblings / Family Class
    familyGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyGroup',
      default: null, // null = single student
    },

    // 🗓 Schedule Reference
    schedule: {
    days: [{
      type: String,
      enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    }],
    utcStart: Date,
    utcEnd: Date
  },

    // 💰 Billing Info
    monthlyFee: {
      type: Number,
      required: true,
    },
    billing: {
      currentMonth: String, // e.g. "2026-01"
      feeStatus: {
        type: String,
        enum: ['paid', 'pending'],
        default: 'pending',
      },
    },

    // 📌 Enrollment Lifecycle
    status: {
      type: String,
      enum: [
        'pending',    // student request
        'approved',   // admin approved
        'active',     // classes running
        'paused',     // leave / vacation
        'completed',  // finished course
        'cancelled',  // dropped
        'rejected',
      ],
      default: 'pending',
    },

    // 📆 Dates
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    startDate: Date,
    endDate: Date,

    // 💤 Leave / Pause Info
    pauseInfo: {
      pausedBy: {
        type: String,
        enum: ['student', 'ulma', 'admin'],
      },
      reason: String,
      pausedAt: Date,
    },

    // 🛠 Admin Processing
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // admin
    },
    processedAt: Date,
    notes: String,

    // 🔐 Permissions
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    quizEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Enrollment', enrollmentSchema);
