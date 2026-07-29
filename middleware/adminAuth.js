// backend/middleware/adminAuth.js 111

import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

const adminAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        res.status(401);
        throw new Error('User not found');
      }

      // Check if user is admin
      if (user.role !== 'admin') {
        res.status(403);
        throw new Error('Access denied. Admin privileges required.');
      }

      // Check if admin is active
      if (!user.isActive) {
        res.status(401);
        throw new Error('Admin account is deactivated');
      }

      req.user = user;
      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

// Super admin check
const superAdminAuth = asyncHandler(async (req, res, next) => {
  // Check if user is super admin (you can add super admin field to User model)
  if (!req.user.isSuperAdmin) {
    res.status(403);
    throw new Error('Access denied. Super admin privileges required.');
  }
  next();
});

export { adminAuth, superAdminAuth };