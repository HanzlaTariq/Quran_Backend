// import mongoose from 'mongoose';

// const LiveSessionSchema = new mongoose.Schema({
//   student: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//   },
//   qari: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//   },
//   scheduledTime: {
//     type: Date,
//     required: true,
//   },
//   duration: {
//     type: Number, // in minutes
//     default: 60,
//   },
//   status: {
//     type: String,
//     enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'],
//     default: 'pending',
//   },
//   meetingLink: String,
//   meetingId: String,
//   meetingPassword: String,
//   agenda: String,
//   notes: String,
//   recordingUrl: String,
//   rating: {
//     type: Number,
//     min: 1,
//     max: 5,
//   },
//   feedback: String,
//   paymentStatus: {
//     type: String,
//     enum: ['pending', 'paid', 'failed'],
//     default: 'pending',
//   },
//   amount: Number,
//   currency: {
//     type: String,
//     default: 'USD',
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// export default mongoose.model('LiveSession', LiveSessionSchema);
