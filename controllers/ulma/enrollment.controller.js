import asyncHandler from 'express-async-handler';
import Enrollment from '../../models/Enrollment.js';
import Ulma from '../../models/Ulma.js';
import Student from '../../models/Student.js';
import Course from '../../models/Course.js';
import User from '../../models/User.js';

// @desc    Get all enrollments for ulma (with schedule)
// @route   GET /api/ulma/enrollments
// @access  Private/Ulma
export const getUlmaEnrollments = asyncHandler(async (req, res) => {
  // Find the Ulma document for this user
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  // Find enrollments for this ulma
  const enrollments = await Enrollment.find({
    ulma: ulma._id,
    status: { $in: ['approved', 'active'] },
  })
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' }
    })
    .populate('course', 'name');

  // Format for frontend timetable
  const formatted = enrollments.map(enr => ({
    id: enr._id,
    studentId: enr.student?._id,
    studentName: enr.student?.user?.name,
    courseId: enr.course?._id,
    courseName: enr.course?.name,
    schedule: enr.schedule, // { days: [...], startTime, endTime }
  }));

  res.json({ enrollments: formatted });
});
