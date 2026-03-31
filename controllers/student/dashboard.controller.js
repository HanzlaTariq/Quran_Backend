import asyncHandler from 'express-async-handler';
import Student from '../../models/Student.js';
import Class from '../../models/Class.js';
import Assignment from '../../models/Assignment.js';
import Enrollment from '../../models/Enrollment.js';

// @desc    Get student dashboard stats
// @route   GET /api/students/stats
// @access  Private/Student
export const getStudentStats = asyncHandler(async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user.id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get total classes
    const totalClasses = await Class.countDocuments({
      student: student._id,
      status: 'completed'
    });

    // Get attendance rate
    const attendedClasses = await Class.countDocuments({
      student: student._id,
      status: 'completed',
      attendance: { $exists: true, $ne: null }
    });
    const attendanceRate = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;

    // Get assignments counts
    const assignmentsPending = await Assignment.countDocuments({
      student: student._id,
      status: 'pending'
    });

    const assignmentsCompleted = await Assignment.countDocuments({
      student: student._id,
      status: 'completed'
    });

    // Get upcoming classes count
    const upcomingClassesCount = await Class.countDocuments({
      student: student._id,
      status: 'scheduled',
      date: { $gte: new Date() }
    });

    // Get active enrollments
    const activeEnrollments = await Enrollment.countDocuments({
      student: student._id,
      status: 'approved'
    });

    res.json({
      success: true,
      stats: {
        totalClasses,
        attendanceRate,
        assignmentsPending,
        assignmentsCompleted,
        upcomingClassesCount,
        activeEnrollments,
        progressPercentage: Math.round((student.progress.currentPara || 1) / 30 * 100),
        currentPara: student.progress.currentPara || 1,
        currentSurah: student.progress.currentSurah || 'Al-Fatiha',
        ayatCompleted: student.progress.ayatCompleted || 0
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats'
    });
  }
});

// @desc    Get recent activity
// @route   GET /api/students/recent-activity
// @access  Private/Student
export const getRecentActivity = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  // Get recent classes
  const recentClasses = await Class.find({
    student: student._id
  })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .sort({ date: -1 })
    .limit(5);

  // Get recent assignments
  const recentAssignments = await Assignment.find({
    student: student._id
  })
    .sort({ createdAt: -1 })
    .limit(5);

  res.json({
    success: true,
    recentClasses,
    recentAssignments
  });
});