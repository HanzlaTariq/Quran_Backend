// models/Message.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

// ⚠️ FIX: courseId should be String, not ObjectId
const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  courseId: { type: String, required: true }, // Changed from ObjectId to String
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  clientId: { type: String },
  deletedAt: Date,
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

messageSchema.index({ senderId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
export default mongoose.model('Message', messageSchema);