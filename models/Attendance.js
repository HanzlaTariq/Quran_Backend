import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    classId: {type:mongoose.Schema.Types.ObjectId,ref:'Class'},
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

// Legacy attendance is preserved without guessing a class. New writes always include classId.
// Existing databases MUST run scripts/migrate-classroom.js --apply after a backup.
attendanceSchema.index({classId:1},{unique:true,partialFilterExpression:{classId:{$type:'objectId'}}});
attendanceSchema.index({enrollment:1,date:1});

export default mongoose.model('Attendance', attendanceSchema);




