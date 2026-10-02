import mongoose from 'mongoose';

/**
 * Availability Slot
 * Sirf ye batata hai:
 * Ulma kis din, kis time free hota hai
 */
const availabilitySlotSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true
  },
  startTime: {
    type: String, // "18:00"
    required: true
  },
  endTime: {
    type: String, // "18:30"
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: false });

/**
 * Ulma Schema
 */
const ulmaSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quranSettings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuranSettings',
    required: false
  },
  bio: String,
  courses: [{type:mongoose.Schema.Types.ObjectId,ref:'Course'}],
  qualifications: [{ degree: String, institution: String, year: Number }],
  certificates: [{ name: String, fileUrl: String, issuedDate: Date }],
  experience: { type: Number, default: 0 },
  expertise: [{ type: String }],
  hourlyRate: { type: Number, default: 0 },
 
  // 🌞 Working hours
  workingHours: {
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '17:00' }
  },

  // 🕒 Free slot template
  availability: [availabilitySlotSchema],

  // 📚 Lecture / booked slots
  lectureSlots: [{
    day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
    startTime: String,
    endTime: String,
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' }
  }],

  leaveSchedule: [{ from: Date, to: Date, reason: String }],
  rating: {
    average: { type: Number, min: 0, max: 5, default: 0 },
    totalReviews: { type: Number, default: 0 }
  },
  totalClassesConducted: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: false }

}, { timestamps: true });


export default mongoose.model('Ulma', ulmaSchema);
