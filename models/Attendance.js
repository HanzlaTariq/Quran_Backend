import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
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

    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ['present', 'absent', 'late'],
      default: 'present',
    },

    remarks: {
      type: String,
      trim: true,
    },

    markedAt: {
      type: Date,
      default: Date.now,
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// ✅ ONE attendance per enrollment per day
attendanceSchema.index(
  { enrollment: 1, date: 1 },
  { unique: true }
);

export default mongoose.model('Attendance', attendanceSchema);




