import asyncHandler from 'express-async-handler';
import Notification from '../models/Notification.js';

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({
    success: true,
    notifications,
    unreadCount: notifications.filter(n => !n.isRead).length
  });
});


// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { isRead: true },
    { new: true }
  );

  if (notification) {
    res.json({ success: true, notification });
  } else {
    res.status(404);
    throw new Error('Notification not found');
  }
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user.id, isRead: false },
    { isRead: true }
  );

  res.json({ success: true, message: 'All notifications marked as read' });
});

// @desc    Create notification (for internal use)
// @route   POST /api/notifications
// @access  Private/Admin/Ulma
const createNotification = asyncHandler(async (req, res) => {
  const { userId, title, message, type, link, metadata } = req.body;

  const notification = await Notification.create({
    user: userId,
    title,
    message,
    type: type || 'announcement',
    link,
    metadata
  });

  res.status(201).json({
    success: true,
    notification
  });
});

export {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification
};