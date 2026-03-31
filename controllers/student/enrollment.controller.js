import asyncHandler from 'express-async-handler';
import Student from '../../models/Student.js';
import Enrollment from '../../models/Enrollment.js';
import Course from '../../models/Course.js';
import Conversation from '../../models/Conversation.js';
import Attendance from '../../models/Attendance.js';
import { normalizeScheduleToUTC } from '../../utils/scheduleTimezone.js';

// @desc    Request Ulma enrollment
// @route   POST /api/students/enroll
// @access  Private/Student
export const requestEnrollment = asyncHandler(async (req, res) => {
  const { ulmaId, course, schedule, monthlyFee } = req.body;

  const student = await Student.findOne({ user: req.user.id });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student profile not found'
    });
  }

  console.log('Received enrollment data:', req.body);

  if (!ulmaId || !course || !schedule) {
    return res.status(400).json({
      message: 'Missing required fields'
    });
  }

  if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
    return res.status(400).json({
      message: 'Schedule days are required'
    });
  }

  if (!schedule.startTime || !schedule.endTime) {
    return res.status(400).json({
      message: 'Schedule startTime and endTime are required'
    });
  }

  const normalizedSchedule = normalizeScheduleToUTC(schedule);

  const existingEnrollment = await Enrollment.findOne({
    student: student._id,
    course,
    status: { $nin: ['cancelled', 'rejected', 'completed'] }
  });

  // Resolve course object for user message and validation
  const courseDoc = await Course.findById(course);
  if (!courseDoc) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  if (existingEnrollment) {
    return res.status(400).json({
      success: false,
      message: `You are already enrolled in ${courseDoc.name}`
    });
  }

  const enrollment = await Enrollment.create({
    student: student._id,
    ulma: ulmaId,
    course,
    schedule: normalizedSchedule,
    monthlyFee: monthlyFee || 50,
    status: 'pending',
    billing: {
      currentMonth: new Date().toISOString().slice(0, 7),
      feeStatus: 'pending'
    }
  });

  return res.status(201).json({
    success: true,
    message: 'Enrollment request submitted successfully',
    enrollment
  });
});

// @desc    Get student's enrollments
// @route   GET /api/students/enroll/my-enrollments
// @access  Private/Student
export const getMyEnrollments = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student profile not found'
    });
  }

  const enrollments = await Enrollment.find({ student: student._id })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate('course', 'name description')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .sort({ createdAt: -1 })
    .lean();

  // Attach attendance stats per enrollment so frontend can show accurate percentages.
  const enrollmentIds = enrollments.map((enrollment) => enrollment._id);
  const attendanceStatsByEnrollment = new Map();

  if (enrollmentIds.length > 0) {
    const aggregatedStats = await Attendance.aggregate([
      { $match: { enrollment: { $in: enrollmentIds } } },
      {
        $group: {
          _id: '$enrollment',
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $eq: ['$status', 'present'] }, 1, 0]
            }
          },
          absent: {
            $sum: {
              $cond: [{ $eq: ['$status', 'absent'] }, 1, 0]
            }
          },
          late: {
            $sum: {
              $cond: [{ $eq: ['$status', 'late'] }, 1, 0]
            }
          },
          lastUpdated: { $max: '$updatedAt' }
        }
      }
    ]);

    for (const stat of aggregatedStats) {
      const percentage = stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0;
      attendanceStatsByEnrollment.set(stat._id.toString(), {
        total: stat.total,
        present: stat.present,
        absent: stat.absent,
        late: stat.late,
        percentage,
        lastUpdated: stat.lastUpdated || null,
      });
    }
  }

  for (const enrollment of enrollments) {
    const defaultStats = {
      total: 0,
      present: 0,
      absent: 0,
      late: 0,
      percentage: 0,
      lastUpdated: null,
    };

    enrollment.attendanceStats = attendanceStatsByEnrollment.get(enrollment._id.toString()) || defaultStats;
  }

  // Add conversationId to each enrollment
  for (let enrollment of enrollments) {
    if (enrollment.status === 'approved') {
      try {
        let conversation = await Conversation.findOne({
          studentId: enrollment.student?.user?._id,
          ulmaId: enrollment.ulma?.user?._id
        });
        if (!conversation) {
          conversation = await Conversation.create({
            studentId: enrollment.student.user._id,
            ulmaId: enrollment.ulma.user._id,
            courseId: enrollment.course._id, // Use course ObjectId, not name
            lastMessage: '',
            lastUpdated: new Date()
          });
        }
        if (enrollment.ulma) {
          enrollment.ulma.conversationId = conversation._id;
        }
      } catch (error) {
        console.error('Error finding/creating conversation for enrollment:', enrollment._id, error);
      }
    }
  }

  res.status(200).json({
    success: true,
    enrollments
  });
});

// @desc    Get single enrollment details
// @route   GET /api/students/enrollments/:id
// @access  Private/Student
export const getEnrollmentDetails = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  const enrollment = await Enrollment.findOne({
    _id: req.params.id,
    student: student._id
  })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email profileImage'
      }
    })
    .populate('course', 'name description curriculum');

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  res.json({
    success: true,
    enrollment
  });
});

// @desc    Cancel enrollment
// @route   PUT /api/students/enrollments/:id/cancel
// @access  Private/Student
export const cancelEnrollment = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  const enrollment = await Enrollment.findOne({
    _id: req.params.id,
    student: student._id
  });

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  if (enrollment.status !== 'approved' && enrollment.status !== 'pending') {
    res.status(400);
    throw new Error('This enrollment cannot be cancelled');
  }

  enrollment.status = 'cancelled';
  enrollment.cancelledAt = new Date();
  enrollment.cancellationReason = req.body.reason || 'Student requested cancellation';

  await enrollment.save();

  res.json({
    success: true,
    message: 'Enrollment cancelled successfully',
    enrollment
  });
});