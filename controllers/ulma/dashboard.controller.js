import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import Student from '../../models/Student.js';
import Class from '../../models/Class.js';
import { calculateDuration } from '../utils/class.utils.js';

// @desc    Get ulma dashboard data
// @route   GET /api/ulma/dashboard
// @access  Private/Ulma
export const getDashboardData = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id })
    .populate('user', 'name email phone country timezone languages profileImage');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma profile not found');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get total students
  const totalStudents = await Student.countDocuments({ currentUlma: ulma._id });

  // Get today's classes
  const todaysClasses = await Class.find({
    ulma: ulma._id,
    date: { $gte: today, $lt: tomorrow },
    status: { $in: ['scheduled', 'ongoing', 'completed'] }
  })
    .populate('course', 'name')
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email profileImage'
      }
    })
    .populate('attendance', 'status')
    .sort({ startTime: 1 });

  // Get upcoming classes (next 7 days)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingClasses = await Class.find({
    ulma: ulma._id,
    date: { $gte: tomorrow, $lte: nextWeek },
    status: 'scheduled'
  })
    .populate('course', 'name')
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .populate('attendance', 'status')
    .sort({ date: 1, startTime: 1 })
    .limit(10);

  // Get recent students
  const recentStudents = await Student.find({ currentUlma: ulma._id })
    .populate('user', 'name email country profileImage')
    .populate('currentCourse', 'name') // ✅ ADD THIS

    .sort({ enrollmentDate: -1 })
    .limit(5);

  // Get earnings data
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthlyClasses = await Class.find({
    ulma: ulma._id,
    date: { $gte: startOfMonth },
    status: 'completed'
  });

  const monthlyEarnings = monthlyClasses.reduce((sum, classItem) => {
    const duration = calculateDuration(classItem);
    return sum + (duration * ulma.hourlyRate / 60);
  }, 0);

  // Get weekly stats for chart
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Start from Monday
  const weeklyStats = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayClasses = await Class.find({
      ulma: ulma._id,
      date: { $gte: day, $lt: nextDay },
      status: 'completed'
    });

    const dayEarnings = dayClasses.reduce((sum, classItem) => {
      const duration = calculateDuration(classItem.startTime, classItem.endTime);
      return sum + (duration * ulma.hourlyRate / 60);
    }, 0);

    weeklyStats.push({
      day: day.toLocaleDateString('en-US', { weekday: 'short' }),
      classes: dayClasses.length,
      earnings: Math.round(dayEarnings * 100) / 100
    });
  }

  res.json({
    profile: ulma,
    todaysClasses,
    upcomingClasses: upcomingClasses.slice(0, 5),
    students: recentStudents,
    stats: {
      totalStudents,
      todaysClassesCount: todaysClasses.length,
      monthlyEarnings: Math.round(monthlyEarnings * 100) / 100,
      rating: ulma.rating?.average || 0,
      totalReviews: ulma.rating?.totalReviews || 0,
      hourlyRate: ulma.hourlyRate || 0,
      experience: ulma.experience || 0,
      expertise: ulma.expertise || [],
      totalClasses: ulma.totalClassesConducted || 0
    },
    weeklyStats,
    notifications: [
      {
        id: 1,
        title: 'New student enrollment',
        description: 'Ahmed Khan has enrolled in your Hifz course',
        time: '2 hours ago',
        type: 'enrollment',
        read: false,
      },
      {
        id: 2,
        title: 'Class starting soon',
        description: 'Your class with Fatima starts in 30 minutes',
        time: 'Today at 2:30 PM',
        type: 'reminder',
        read: false,
      }
    ]
  });
});