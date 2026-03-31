import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import User from '../../models/User.js';
import Student from '../../models/Student.js';
import Class from '../../models/Class.js';

// @desc    Get ulma profile
// @route   GET /api/ulma/profile
// @access  Private/Ulma
export const getUlmaProfile = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id })
    .populate('user', 'name email phone country timezone languages profileImage')
    .populate('qualifications')
    .populate('certificates');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma profile not found');
  }

  // Get statistics
  const totalStudents = await Student.countDocuments({ currentUlma: ulma._id });
  const totalClasses = await Class.countDocuments({ ulma: ulma._id, status: 'completed' });
  const upcomingClasses = await Class.countDocuments({
    ulma: ulma._id,
    status: 'scheduled',
    date: { $gte: new Date() }
  });

  res.json({
    ...ulma._doc,
    statistics: {
      totalStudents,
      totalClasses,
      upcomingClasses,
      rating: ulma.rating,
    },
  });
});

// @desc    Update ulma profile
// @route   PUT /api/ulma/profile
// @access  Private/Ulma
export const updateUlmaProfile = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma profile not found');
  }

  // Update user information
  if (req.body.user) {
    const userUpdates = {};
    if (req.body.user.phone) userUpdates.phone = req.body.user.phone;
    if (req.body.user.timezone) userUpdates.timezone = req.body.user.timezone;
    if (req.body.user.languages) userUpdates.languages = req.body.user.languages;
    if (req.body.user.country) userUpdates.country = req.body.user.country;
    if (req.file) userUpdates.profileImage = req.file.filename;

    await User.findByIdAndUpdate(req.user.id, userUpdates);
  }

  // Update ulma profile
  ulma.qualifications = req.body.qualifications || ulma.qualifications;
  ulma.experience = req.body.experience || ulma.experience;
  ulma.expertise = req.body.expertise || ulma.expertise;
  ulma.hourlyRate = req.body.hourlyRate || ulma.hourlyRate;
  ulma.availability = req.body.availability || ulma.availability;
  ulma.workingHours = req.body.workingHours || ulma.workingHours;
  ulma.bio = req.body.bio || ulma.bio;
  ulma.certificates = req.body.certificates || ulma.certificates;
  
  const updatedUlma = await ulma.save();

  // Populate user data
  const populatedUlma = await Ulma.findById(updatedUlma._id)
    .populate('user', 'name email phone country timezone languages profileImage');

  res.json({
    success: true,
    message: 'Profile updated successfully',
    ulma: populatedUlma,
  });
});

// @desc    Upload profile image
// @route   POST /api/ulma/upload-profile-image
// @access  Private/Ulma
export const uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image');
  }

  await User.findByIdAndUpdate(req.user.id, {
    profileImage: `/uploads/${req.file.filename}`
  });

  res.json({
    success: true,
    message: 'Profile image updated successfully',
    imageUrl: `/uploads/${req.file.filename}`
  });
});