import asyncHandler from 'express-async-handler';
import Student from '../../models/Student.js';
import User from '../../models/User.js';

// @desc    Get student by user ID
// @route   GET /api/students/by-user/:userId
// @access  Private
export const getStudentByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const student = await Student.findOne({ user: userId })
    .populate('user', 'name email phone country timezone languages')
    .populate('currentUlma');

  if (student) {
    res.json(student);
  } else {
    // Return empty object instead of error, in case student hasn't been created yet
    res.json({
      preferences: {
        cameraOnByDefault: false,
        language: 'english',
        notificationsEnabled: true
      }
    });
  }
});

// @desc    Get student by ID
// @route   GET /api/students/:id
// @access  Private
export const getStudentById = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate('user', 'name email phone country timezone')
    .populate('currentUlma');

  if (student) {
    res.json(student);
  } else {
    res.status(404);
    throw new Error('Student not found');
  }
});

// @desc    Get all students (for admin)
// @route   GET /api/students
// @access  Private/Admin
export const getStudents = asyncHandler(async (req, res) => {
  const students = await Student.find()
    .populate('user', 'name email phone country')
    .populate('currentUlma', 'user')
    .populate({
      path: 'currentUlma',
      populate: {
        path: 'user',
        select: 'name email'
      }
    });

  res.json(students);
});

// @desc    Update student profile
// @route   PUT /api/students/profile
// @access  Private/Student
export const updateStudentProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Update user information
  const { name, phone, country, timezone, languages } = req.body;
  
  const user = await User.findById(req.user.id);
  if (user) {
    user.name = name || user.name;
    user.phone = phone || user.phone;
    user.country = country || user.country;
    user.timezone = timezone || user.timezone;
    user.languages = languages || user.languages;
    
    if (req.file) {
      user.profileImage = req.file.filename;
    }
    
    await user.save();
  }

  // Update student specific fields
  if (req.body.bio) student.bio = req.body.bio;
  
  await student.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    student: await Student.findById(student._id).populate('user', 'name email phone country timezone languages profileImage')
  });
});

// @desc    Update student preferences
// @route   PUT /api/students/:id/preferences
// @access  Private/Student
export const updateStudentPreferences = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cameraOnByDefault, language, notificationsEnabled, emailNotifications, classReminders, progressReports } = req.body;
  
  const student = await Student.findById(id);
  
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Update preferences
  if (cameraOnByDefault !== undefined) student.preferences.cameraOnByDefault = cameraOnByDefault;
  if (language) student.preferences.language = language;
  if (notificationsEnabled !== undefined) student.preferences.notificationsEnabled = notificationsEnabled;
  
  await student.save();

  res.json({
    success: true,
    message: 'Preferences updated successfully',
    preferences: student.preferences
  });
});