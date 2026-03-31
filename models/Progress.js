// const mongoose = require('mongoose');

// const ProgressSchema = new mongoose.Schema({
//   student: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//   },
//   surahNumber: Number,
//   ayahFrom: Number,
//   ayahTo: Number,
//   type: {
//     type: String,
//     enum: ['recitation', 'memorization', 'understanding'],
//   },
//   status: {
//     type: String,
//     enum: ['not-started', 'learning', 'reviewing', 'mastered'],
//     default: 'not-started',
//   },
//   accuracy: Number, // percentage
//   lastPracticed: Date,
//   totalTimeSpent: Number, // in minutes
//   notes: String,
//   teacherFeedback: String,
// });

// export default mongoose.model('Progress', ProgressSchema);