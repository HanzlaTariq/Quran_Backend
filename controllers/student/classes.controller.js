import asyncHandler from 'express-async-handler';
import Student from '../../models/Student.js';
import Class from '../../models/Class.js';
import Attendance from '../../models/Attendance.js';

// @desc    Get student classes
// @route   GET /api/students/classes
// @access  Private/Student
export const getStudentClasses = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  let query = Class.find({ student: student._id })
    .populate('ulma', 'user')
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .populate('course', 'name description')
    .sort({ date: -1 });

  // Check for limit query param
  const limit = parseInt(req.query.limit);
  if (!isNaN(limit)) {
    query = query.limit(limit);
  }

  const classes = await query;

  res.json(classes);
});

// @desc    Get upcoming classes
// @route   GET /api/students/classes/upcoming
// @access  Private/Student
export const getUpcomingClasses = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const classes = await Class.find({
    student: student._id,
    date: { $gte: today },
    status: { $in: ['scheduled', 'ongoing'] }
  })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .populate('course', 'name description')
    .sort({ date: 1, startTime: 1 })
    .limit(10);

  res.json({
    success: true,
    classes
  });
});

// @desc    Get class details
// @route   GET /api/students/classes/:id
// @access  Private/Student
export const getClassDetails = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  const classItem = await Class.findOne({
    _id: req.params.id,
    student: student._id
  })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email profileImage'
      }
    });

  if (!classItem) {
    res.status(404);
    throw new Error('Class not found');
  }

  // Get attendance for this class
  const attendance = await Attendance.findOne({
    class: classItem._id,
    student: student._id
  });

  res.json({
    success: true,
    class: classItem,
    attendance
  });
});