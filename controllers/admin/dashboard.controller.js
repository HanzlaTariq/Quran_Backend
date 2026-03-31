import asyncHandler from 'express-async-handler';
import User from '../../models/User.js';
import Student from '../../models/Student.js';
import Ulma from '../../models/Ulma.js';
import Course from '../../models/Course.js';
import Class from '../../models/Class.js';
import Enrollment from '../../models/Enrollment.js';
import Payment from '../../models/Payment.js';

// @desc    Get admin dashboard stats
// @route   GET /api/admin/dashboard/stats
// @access  Private/Admin
export const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Get all counts in parallel
    const [
      totalStudents,
      totalUlma,
      totalAdmins,
      totalCourses,
      pendingEnrollments,
      pendingUlmaApprovals,
      todayClasses,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'ulma' }),
      User.countDocuments({ role: 'admin' }),
      Course.countDocuments({ isActive: true }),
      Enrollment.countDocuments({ status: 'pending' }),
      Ulma.countDocuments({ isApproved: false }),
      Class.countDocuments({
        date: {
          $gte: new Date(today.setHours(0, 0, 0, 0)),
          $lt: new Date(today.setHours(23, 59, 59, 999))
        },
        status: 'scheduled'
      }),
    ]);

    // Get revenue data
    const monthlyPayments = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const yearlyPayments = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Get new students this month
    const newStudentsThisMonth = await User.countDocuments({
      role: 'student',
      createdAt: { $gte: startOfMonth }
    });

    // Get completion rate
    const totalCompletedClasses = await Class.countDocuments({
      status: 'completed',
      createdAt: { $gte: startOfMonth }
    });
    const totalScheduledClasses = await Class.countDocuments({
      status: { $in: ['scheduled', 'completed'] },
      createdAt: { $gte: startOfMonth }
    });
    const completionRate = totalScheduledClasses > 0
      ? Math.round((totalCompletedClasses / totalScheduledClasses) * 100)
      : 0;

    // Get average rating
    const ulmaWithRatings = await Ulma.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' }
        }
      }
    ]);
    const avgRating = ulmaWithRatings[0]?.avgRating || 0;

    res.json({
      totalStudents,
      totalUlma,
      totalAdmins,
      totalCourses,
      monthlyRevenue: monthlyPayments[0]?.total || 0,
      totalRevenue: yearlyPayments[0]?.total || 0,
      pendingEnrollments,
      pendingUlmaApprovals,
      todayClasses,
      newStudentsThisMonth,
      completionRate,
      avgRating: parseFloat(avgRating.toFixed(1)),
      activeCourses: totalCourses,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
});