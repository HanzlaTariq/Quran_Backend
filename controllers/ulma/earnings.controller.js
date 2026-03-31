import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import Class from '../../models/Class.js';
import { calculateDuration } from '../utils/class.utils.js';

// @desc    Get earnings
// @route   GET /api/ulma/earnings
// @access  Private/Ulma
export const getEarnings = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const { month, year } = req.query;

  let matchQuery = { ulma: ulma._id, status: 'completed' };

  if (month && year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    matchQuery.date = { $gte: startDate, $lte: endDate };
  } else {
    // Default to current month
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    matchQuery.date = { $gte: startDate, $lte: endDate };
  }

  const classes = await Class.find(matchQuery);

  const totalEarnings = classes.reduce((sum, classItem) => {
    const duration = calculateDuration(classItem);
    return sum + (duration * ulma.hourlyRate / 60);
  }, 0);

  // Get monthly earnings for last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const monthlyClasses = await Class.find({
    ulma: ulma._id,
    date: { $gte: sixMonthsAgo },
    status: 'completed'
  });

  const monthlyEarnings = {};
  monthlyClasses.forEach(classItem => {
    const monthYear = `${classItem.date.getFullYear()}-${String(classItem.date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyEarnings[monthYear]) {
      monthlyEarnings[monthYear] = 0;
    }
    const duration = calculateDuration(classItem);
    monthlyEarnings[monthYear] += duration * ulma.hourlyRate / 60;
  });

  // Fill missing months with zero
  const monthlyEarningsArray = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    monthlyEarningsArray.push({
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      year: date.getFullYear(),
      amount: Math.round((monthlyEarnings[monthYear] || 0) * 100) / 100,
    });
  }

  res.json({
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    monthlyEarnings: monthlyEarningsArray,
    hourlyRate: ulma.hourlyRate || 0,
    totalClasses: classes.length,
    totalHours: Math.round(classes.reduce((sum, classItem) => {
      return sum + calculateDuration(classItem) / 60;
    }, 0) * 100) / 100,
  });
});

// @desc    Get performance stats
// @route   GET /api/ulma/performance
// @access  Private/Ulma
export const getPerformance = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  // Get classes data
  const recentClasses = await Class.find({
    ulma: ulma._id,
    date: { $gte: last30Days }
  }).sort({ date: -1 });

  // Calculate statistics
  const completedClasses = recentClasses.filter(c => c.status === 'completed').length;
  const cancelledClasses = recentClasses.filter(c => c.status === 'cancelled').length;
  const attendanceRate = completedClasses > 0 ?
    (recentClasses.filter(c => c.attendance).length / completedClasses) * 100 : 0;

  // Get student feedback (in real app, fetch from feedback collection)
  const feedback = {
    averageRating: ulma.rating?.average || 0,
    totalReviews: ulma.rating?.totalReviews || 0,
    distribution: {
      5: Math.floor((ulma.rating?.totalReviews || 0) * 0.6),
      4: Math.floor((ulma.rating?.totalReviews || 0) * 0.25),
      3: Math.floor((ulma.rating?.totalReviews || 0) * 0.1),
      2: Math.floor((ulma.rating?.totalReviews || 0) * 0.04),
      1: Math.floor((ulma.rating?.totalReviews || 0) * 0.01),
    }
  };

  res.json({
    overview: {
      totalStudents: await Student.countDocuments({ currentUlma: ulma._id }),
      totalClasses: ulma.totalClassesConducted || 0,
      completionRate: completedClasses > 0 ? ((completedClasses - cancelledClasses) / completedClasses) * 100 : 0,
      attendanceRate,
      averageRating: feedback.averageRating,
    },
    recentActivity: {
      classesLast30Days: recentClasses.length,
      newStudentsLast30Days: await Student.countDocuments({
        currentUlma: ulma._id,
        enrollmentDate: { $gte: last30Days }
      }),
    },
    feedback,
  });
});