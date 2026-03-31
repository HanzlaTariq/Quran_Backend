import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  targetRoles: [{
    type: String,
    enum: ['student', 'ulma', 'admin'],
  }],
  isImportant: {
    type: Boolean,
    default: false,
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    readAt: Date,
  }],
}, {
  timestamps: true,
});

export default mongoose.model('Announcement', announcementSchema);