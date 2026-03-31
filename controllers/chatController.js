import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Student from '../models/Student.js';
import Ulma from '../models/Ulma.js';
import User from '../models/User.js';

// Create conversation (after enrollment approved)
export const createConversation = async (req, res) => {
  const { studentId, ulmaId, courseId } = req.body;

  try {
    let conversation = await Conversation.findOne({ studentId, ulmaId, courseId });
    if (conversation) return res.status(200).json({ success: true, conversation });

    conversation = new Conversation({ studentId, ulmaId, courseId });
    await conversation.save();
    res.status(201).json({ success: true, conversation });
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: err.message });
  }
};

// Send message
export const sendMessage = async (req, res) => {
  const { conversationId, message } = req.body;
  const senderId = req.user.id;

  try {
    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Determine receiverId
    let receiverId;
    if (conversation.studentId.toString() === senderId) {
      receiverId = conversation.ulmaId;
    } else if (conversation.ulmaId.toString() === senderId) {
      receiverId = conversation.studentId;
    } else {
      return res.status(403).json({ error: 'You are not part of this conversation' });
    }

    // ⚠️ FIX: courseId ko String ki tarah save karo
    const newMessage = new Message({
      conversationId,
      courseId: conversation.courseId.toString(), // Convert to string
      senderId,
      receiverId,
      message
    });
    
    await newMessage.save();

    // Update lastMessage in conversation
    await Conversation.findByIdAndUpdate(conversationId, { 
      lastMessage: message, 
      lastUpdated: Date.now() 
    });

    res.status(201).json({ 
      success: true, 
      message: newMessage 
    });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get messages by conversation
export const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;

  try {
    // Check if conversation exists and user has access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if user is part of this conversation
    if (conversation.studentId.toString() !== userId && 
        conversation.ulmaId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mark messages as read where receiver is current user
    await Message.updateMany(
      { conversationId, receiverId: userId, isRead: false },
      { isRead: true }
    );

    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
    
    res.status(200).json({ 
      success: true, 
      messages,
      conversation
    });
  } catch (err) {
    console.error('Error in getMessages:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get all conversations for a user
export const getConversations = async (req, res) => {
  const { userId } = req.params;

  try {
    const conversations = await Conversation.find({
      $or: [{ studentId: userId }, { ulmaId: userId }]
    })
      .populate('studentId', 'name email')
      .populate('ulmaId', 'name email')
      .sort({ lastUpdated: -1 });
    
    res.status(200).json({ success: true, conversations });
  } catch (err) {
    console.error('Error getting conversations:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get conversations for current user (from auth)
export const getMyConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    let conversations = await Conversation.find({
      $or: [{ studentId: userId }, { ulmaId: userId }]
    })
      .populate('studentId', 'name email')
      .populate('ulmaId', 'name email')
      .sort({ lastUpdated: -1 });

    // Format conversations
    const formattedConversations = conversations.map(conv => {
      let otherUser = null;
      
      if (req.user.role === 'student') {
        otherUser = conv.ulmaId;
      } else if (req.user.role === 'ulma') {
        otherUser = conv.studentId;
      }

      return {
        ...conv.toObject(),
        otherUser,
        partnerName: otherUser?.name || 'Unknown',
        partnerId: otherUser?._id
      };
    });

    res.status(200).json({
      success: true,
      conversations: formattedConversations
    });
  } catch (err) {
    console.error('Error in getMyConversations:', err);
    res.status(500).json({ error: err.message });
  }
};

// Delete message
export const deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is the sender of the message
    if (message.senderId.toString() !== userId) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    await Message.findByIdAndDelete(messageId);
    res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get conversation details
export const getConversationDetails = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    console.log('Getting conversation details:', conversationId, 'user:', userId);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ studentId: userId }, { ulmaId: userId }]
    }).populate('studentId', 'name email')
      .populate('ulmaId', 'name email');

    if (!conversation) {
      console.log('Conversation not found or access denied');
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Ensure courseId is returned as string
    const conversationObj = conversation.toObject();
    conversationObj.courseId = conversation.courseId.toString();

    console.log('Found conversation with courseId:', conversationObj.courseId);

    res.json({
      success: true,
      conversation: conversationObj
    });
  } catch (error) {
    console.error('Error in getConversationDetails:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get unread message count for current user
export const getUnreadMessageCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Message.countDocuments({
      receiverId: userId,
      isRead: false
    });

    res.status(200).json({
      success: true,
      unreadCount
    });
  } catch (err) {
    console.error('Error getting unread message count:', err);
    res.status(500).json({ error: err.message });
  }
};