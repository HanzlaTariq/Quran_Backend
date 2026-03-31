// Export all ulma controllers
export * from './dashboard.controller.js';
export * from './profile.controller.js';
export * from './profile.controller.js';
export * from './students.controller.js';
export * from './classes.controller.js';
export * from './schedule.controller.js';
export * from './earnings.controller.js';
export * from './availability.controller.js';
export * from './notifications.controller.js';
export * from './enrollment.controller.js';

// Import course controller for ulma access
import { getAllCourses } from '../admin/course.controller.js';
export { getAllCourses };

// Chat controller
import Conversation from '../../models/Conversation.js';
import User from '../../models/User.js';

export const getConversationDetails = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const ulmaId = req.user.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      ulmaId: ulmaId
    }).populate('studentId', 'name email');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    res.json({
      conversation,
      student: conversation.studentId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Re-export commonly used utilities
export { calculateDuration } from '../utils/class.utils.js';