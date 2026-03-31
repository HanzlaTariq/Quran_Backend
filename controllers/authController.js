import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Ulma from '../models/Ulma.js';
import Conversation from '../models/Conversation.js';
import generateToken from '../utils/generateToken.js';

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    country,
    timezone,
    role,
    age,
    gender,
    expertise,
    experience,
    languages = ['english'] // Default language
  } = req.body;

  // 1️⃣ Validate role
  if (!['student', 'ulma'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role selected');
  }

  // 2️⃣ Check if user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // 3️⃣ Create common User
  const user = await User.create({
    name,
    email,
    password,
    phone,
    country,
    timezone,
    role,
    languages,
    isVerified: role === 'student', // Students auto-verified
  });

  if (!user) {
    res.status(400);
    throw new Error('Invalid user data');
  }

  // 4️⃣ Create role-specific profile
  if (role === 'student') {
    await Student.create({
      user: user._id,
      age: age || null,
      gender: gender || 'male',
      currentCourse: null,
      currentUlma: null
    });
  } else if (role === 'ulma') {
    await Ulma.create({
      user: user._id,
      expertise: expertise || [],
      experience: experience || 0,
      isApproved: false, // Needs admin approval
      qualifications: [],
      hourlyRate: 0,
      availability: [],
      maxStudentsPerDay: 20,
      rating: { average: 0, totalReviews: 0 },
      bio: '',
      certificates: [],
      totalClassesConducted: 0
    });
  }

  // 5️⃣ Return response with JWT token
  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
    message: role === 'ulma'
      ? 'Registration successful! Your account is pending admin approval.'
      : 'Registration successful!',
  });
});












// backend/controllers/authController.js - Update loginUser function

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check for user email
  const user = await User.findOne({ email }).select('+password');

  if (user && (await user.matchPassword(password))) {
    // Check if user is active
    if (!user.isActive) {
      res.status(401);
      throw new Error('Account is deactivated. Please contact admin.');
    }

    // For Ulma, check if approved
    if (user.role === 'ulma') {
      const ulmaProfile = await Ulma.findOne({ user: user._id });
      if (!ulmaProfile?.isApproved) {
        res.status(401);
        throw new Error('Your account is pending admin approval');
      }
    }

    // Update last login info
    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastIp: req.ip || req.connection.remoteAddress
    });

    // Generate token
    const token = generateToken(user._id);

    // Return user data without password
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      country: user.country,
      timezone: user.timezone,
      languages: user.languages,
      isVerified: user.isVerified,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
    };

    // Add role-specific data
    if (user.role === 'student') {
      const studentProfile = await Student.findOne({ user: user._id })
        .select('age gender currentCourse enrollmentDate progress subscription');
      userData.studentProfile = studentProfile;
    } else if (user.role === 'ulma') {
      const ulmaProfile = await Ulma.findOne({ user: user._id })
        .select('qualifications expertise experience hourlyRate availability rating isApproved bio');
      userData.ulmaProfile = ulmaProfile;
    } else if (user.role === 'admin') {
      // Admin specific data if any
      userData.adminProfile = { isSuperAdmin: false };
    }

    res.json({
      success: true,
      token,
      user: userData,
      message: 'Login successful',
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});




















// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user) {
    let profile = { ...user._doc };
    
    // Ensure all required fields have values
    if (!profile.country) profile.country = '';
    if (!profile.timezone) profile.timezone = '';
    if (!profile.languages) profile.languages = [];
    
    // Get role-specific profile
    if (user.role === 'student') {
      const studentProfile = await Student.findOne({ user: user._id })
        .populate('currentUlma', 'user')
        .populate({
          path: 'currentUlma',
          populate: {
            path: 'user',
            select: 'name email'
          }
        });
      profile.studentProfile = studentProfile;

      // Find conversation with current ulma
      if (studentProfile?.currentUlma) {
        const conversation = await Conversation.findOne({
          studentId: user._id,
          ulmaId: studentProfile.currentUlma.user._id,
          courseId: studentProfile.currentCourse
        });
        if (studentProfile) {
          studentProfile.conversationId = conversation?._id;
        }
      }
    } else if (user.role === 'ulma') {
      const ulmaProfile = await Ulma.findOne({ user: user._id })
        .populate('user', 'name email phone country timezone languages');
      profile.ulmaProfile = ulmaProfile;
    }

    res.json(profile);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user) {
    user.name = req.body.name?.trim() || user.name;
    user.email = req.body.email || user.email;
    user.phone = req.body.phone || user.phone;
    user.country = req.body.country || user.country || '';
    user.timezone = req.body.timezone || user.timezone || '';
    user.languages = req.body.languages && req.body.languages.length > 0 ? req.body.languages : (user.languages || []);

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      country: updatedUser.country,
      timezone: updatedUser.timezone,
      languages: updatedUser.languages,
      role: updatedUser.role,
      profileImage: updatedUser.profileImage,
      token: generateToken(updatedUser._id),
      user: updatedUser
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Change user password
// @route   PUT /api/auth/profile/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Verify current password
  const isPasswordValid = await user.matchPassword(currentPassword);
  if (!isPasswordValid) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password updated successfully'
  });
});

// @desc    Upload user profile image
// @route   POST /api/auth/profile/upload-image
// @access  Private
const uploadProfileImage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  user.profileImage = req.file.filename;
  await user.save();

  res.json({
    success: true,
    message: 'Profile image updated successfully',
    profileImage: user.profileImage
  });
});

export { registerUser, loginUser, getUserProfile, updateUserProfile, changePassword, uploadProfileImage };