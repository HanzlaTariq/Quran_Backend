import asyncHandler from 'express-async-handler';
import Class from '../../models/Class.js';
import Ulma from '../../models/Ulma.js';
import Attendance from '../../models/Attendance.js';

// @desc    Get all classes
// @route   GET /api/admin/classes
// @access  Private/Admin
export const getAllClasses = asyncHandler(async (req, res) => {
  const { status, date, ulmaId, studentId, page = 1, limit = 10 } = req.query;

  let query = {};

  if (status) {
    query.status = status;
  }

  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    query.date = { $gte: startDate, $lte: endDate };
  }

  if (ulmaId) {
    query.ulma = ulmaId;
  }

  if (studentId) {
    query.student = studentId;
  }

  const classes = await Class.find(query)
    .populate('ulma', 'user')
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ date: -1, startTime: -1 });

  const total = await Class.countDocuments(query);

  res.json({
    classes,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get class reports
// @route   GET /api/admin/classes/reports
// @access  Private/Admin
export const getClassReports = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  let matchQuery = {};

  if (startDate && endDate) {
    matchQuery.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const classStats = await Class.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalHours: {
          $sum: {
            $divide: [
              {
                $subtract: [
                  { $toDate: { $concat: ['$date', 'T', '$endTime'] } },
                  { $toDate: { $concat: ['$date', 'T', '$startTime'] } }
                ]
              },
              3600000 // milliseconds to hours
            ]
          },
        },
      },
    },
  ]);

  const attendanceStats = await Class.aggregate([
    { $match: { ...matchQuery, status: 'completed' } },
    {
      $group: {
        _id: null,
        totalClasses: { $sum: 1 },
        attendedClasses: {
          $sum: { $cond: ['$attendance', 1, 0] },
        },
      },
    },
  ]);

  const ulmaPerformance = await Class.aggregate([
    { $match: { ...matchQuery, status: 'completed' } },
    {
      $group: {
        _id: '$ulma',
        totalClasses: { $sum: 1 },
        attendedClasses: {
          $sum: { $cond: ['$attendance', 1, 0] },
        },
        avgDuration: {
          $avg: {
            $divide: [
              {
                $subtract: [
                  { $toDate: { $concat: ['$date', 'T', '$endTime'] } },
                  { $toDate: { $concat: ['$date', 'T', '$startTime'] } }
                ]
              },
              60000 // milliseconds to minutes
            ]
          },
        },
      },
    },
    { $sort: { totalClasses: -1 } },
    { $limit: 10 },
  ]);

  // Populate ulma names
  const ulmaIds = ulmaPerformance.map(u => u._id);
  const ulmaDetails = await Ulma.find({ _id: { $in: ulmaIds } })
    .populate('user', 'name');

  const ulmaPerformanceWithNames = ulmaPerformance.map(perf => {
    const ulma = ulmaDetails.find(u => u._id.equals(perf._id));
    return {
      ...perf,
      ulmaName: ulma?.user?.name || 'Unknown',
      attendanceRate: (perf.attendedClasses / perf.totalClasses) * 100,
    };
  });

  res.json({
    classStats,
    attendanceStats: attendanceStats[0] || {
      totalClasses: 0,
      attendedClasses: 0,
      attendanceRate: 0,
    },
    ulmaPerformance: ulmaPerformanceWithNames,
  });
});

// @desc    Delete class
// @route   DELETE /api/admin/classes/:id
// @access  Private/Admin
export const deleteClass = asyncHandler(async (req, res) => {
  const classItem = await Class.findById(req.params.id);

  if (!classItem) {
    res.status(404);
    throw new Error('Class not found');
  }

  // Can only delete scheduled classes
  if (classItem.status !== 'scheduled') {
    res.status(400);
    throw new Error('Only scheduled classes can be deleted');
  }

  await Class.deleteOne({ _id: classItem._id });

  res.json({
    success: true,
    message: 'Class deleted successfully',
  });
});

// @desc    Get class by ID
// @route   GET /api/admin/classes/:id
// @access  Private/Admin
export const getClassById = asyncHandler(async (req, res) => {
  const classItem = await Class.findById(req.params.id)
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate('enrollment');

  if (!classItem) {
    res.status(404);
    throw new Error('Class not found');
  }

  // Get attendance for this class
  const attendance = await Attendance.findOne({ class: classItem._id });

  res.json({
    ...classItem._doc,
    attendance
  });
});