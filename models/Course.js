import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Nazra', 'Hifz', 'Tajweed', 'Tafseer', 'Arabic']
  },
  description: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in months
    required: true
  },
  monthlyFee: {
    type: Number,
    required: true
  },
  curriculum: [{
    week: Number,
    topic: String,
    description: String,
    paraCovered: Number,
    surahCovered: [String]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Course', courseSchema);