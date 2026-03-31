import express from 'express';
import { createConversation, sendMessage, getMessages, getConversations, getMyConversations, deleteMessage, getConversationDetails, getUnreadMessageCount } from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Create conversation
router.post('/conversation', createConversation);

// Send message
router.post('/message', sendMessage);

// Get messages of a conversation
router.get('/messages/:conversationId',protect,  getMessages);

// Get all conversations for a user
router.get('/conversations/:userId', getConversations);

// Get conversations for current authenticated user
router.get('/conversations', protect, getMyConversations);

// Delete message
router.delete('/message/:messageId', protect, deleteMessage);

// Get conversation details
router.get('/conversation/:conversationId', protect, getConversationDetails);

// Get unread message count
router.get('/unread-count', protect, getUnreadMessageCount);

export default router;
