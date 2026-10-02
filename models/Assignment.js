import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema({
  enrollment: {type:mongoose.Schema.Types.ObjectId,ref:'Enrollment'},
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  ulma: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ulma',
    required: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['memorization', 'recitation', 'understanding', 'test'],
    required: true
  },
  surah: {
    type: String
  },
  fromAyat: {
    type: Number
  },
  toAyat: {
    type: Number
  },
  para: {
    type: Number
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'completed', 'graded', 'late'],
    default: 'pending'
  },
  submission: {
    audioUrl: String,
    text: String,
    submittedAt: Date,
    notes: String
  },
  grade: {
    score: Number,
    maxScore: Number,
    feedback: String,
    gradedAt: Date
  }
}, {
  timestamps: true
});

const Assignment = mongoose.model('Assignment', assignmentSchema);
export default Assignment;