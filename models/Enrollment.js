import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    activeRequestKey:{type:String},
    currency:{type:String,default:'PKR'},
    courseDuration:{type:Number},
    holdExpiresAt:Date,
    generatedAt:Date,
    classesCount:{type:Number,default:0},
    invoiceCount:{type:Number,default:0},
    bookingVersion:{type:Number},
    // Core relations
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
      enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    }],
    utcStart: Date,
    utcEnd: Date,
    timeZone:String,
    studentTimeZone:String,
    firstDate:String,
    untilDate:String,
    slotMinutes:Number,
    slots:[{day:String,startTime:String,_id:false}],
    firstOccurrences:[{utcStart:Date,utcEnd:Date,day:String,startTime:String,_id:false}],
    skipped:[{date:String,time:String,reason:String,_id:false}]
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
        'expired',
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

enrollmentSchema.index({activeRequestKey:1},{unique:true,partialFilterExpression:{activeRequestKey:{$type:'string'}}});
enrollmentSchema.index({ulma:1,status:1});
enrollmentSchema.index({student:1,status:1});
export default mongoose.model('Enrollment', enrollmentSchema);
