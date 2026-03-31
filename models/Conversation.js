import mongoose from 'mongoose';
const { Schema } = mongoose;

const conversationSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  ulmaId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  lastMessage: { type: String, default: '' },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Conversation', conversationSchema);
