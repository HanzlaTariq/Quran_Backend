import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';

// @desc    Get notifications
// @route   GET /api/ulma/notifications
// @access  Private/Ulma
export const getNotifications = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  // In real app, fetch from notifications collection
  // Mock data for now
  const notifications = [
    {
      id: 1,
      title: 'New student enrollment',
      description: 'Ahmed Khan has enrolled in your Hifz course',
      time: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      type: 'enrollment',
      read: false,
    },
    {
      id: 2,
      title: 'Class starting soon',
      description: 'Your class with Fatima starts in 30 minutes',
      time: new Date(),
      type: 'reminder',
      read: false,
    },
    {
      id: 3,
      title: 'New message',
      description: 'You have a new message from student Ali',
      time: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      type: 'message',
      read: true,
    },
    {
      id: 4,
      title: 'Assignment submitted',
      description: 'Student submitted assignment for Tajweed lesson',
      time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      type: 'assignment',
      read: true,
    },
  ];

  res.json({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
  });
});

// @desc    Mark notification as read
// @route   PUT /api/ulma/notifications/:id/read
// @access  Private/Ulma
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  // In real app, update notification in database
  res.json({
    success: true,
    message: 'Notification marked as read',
  });
});