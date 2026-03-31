import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  options: [{
    text: String,
    isCorrect: Boolean,
  }],
  explanation: String,
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  },
  category: {
    type: String,
    enum: ['tajweed', 'memorization', 'translation', 'surah-info', 'prophets'],
  },
  points: {
    type: Number,
    default: 10,
  },
});

const QuizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: String,
  questions: [QuestionSchema],
  totalPoints: Number,
  timeLimit: Number, // in minutes
  language: {
    type: String,
    default: 'en',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const QuizResultSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true,
  },
  score: Number,
  totalQuestions: Number,
  correctAnswers: Number,
  timeTaken: Number, // in seconds
  answers: [{
    questionId: mongoose.Schema.Types.ObjectId,
    selectedOption: Number,
    isCorrect: Boolean,
  }],
  completedAt: {
    type: Date,
    default: Date.now,
  },
});

export const Quiz = mongoose.model('Quiz', QuizSchema);
export const QuizResult = mongoose.model('QuizResult', QuizResultSchema);
