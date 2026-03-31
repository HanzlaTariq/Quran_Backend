import express from 'express';
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  uploadProfileImage
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// Password change route
router.put('/profile/change-password', protect, changePassword);

// Profile image upload route
router.post('/profile/upload-image', protect, upload.single('profileImage'), uploadProfileImage);

export default router;