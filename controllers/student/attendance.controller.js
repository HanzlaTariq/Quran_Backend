import asyncHandler from 'express-async-handler';
import Attendance from '../../models/Attendance.js';
import Student from '../../models/Student.js';
import Enrollment from '../../models/Enrollment.js';
import { 
  formatAttendanceRecord, 
  calculateAttendanceStats,
  getEnrollmentWithVerification
} from '../utils/attendance.utils.js';

/**
 * @desc    Get my attendance (Student)
 * @route   GET /api/attendance/my
 * @access  Private/Student
 */
export const getMyAttendance = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 [STUDENT] Fetching attendance for user:', req.user.id);
    
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      console.log('❌ [STUDENT] Student not found for user:', req.user.id);
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    console.log('✅ [STUDENT] Student found:', student._id);

    const enrollments = await Enrollment.find({
      student: student._id,
      status: { $in: ['approved', 'active'] }
    })
    .populate('teacher', 'user')
    .populate({
      path: 'teacher',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .lean();

    console.log('📊 [STUDENT] Enrollments found:', enrollments.length);

    const attendancePromises = enrollments.map(async (enrollment) => {
      return await Attendance.find({
        enrollment: enrollment._id,
        student: student._id
      })
      .populate('teacher', 'user')
      .populate({
        path: 'teacher',
        populate: {
          path: 'user',
          select: 'name'
        }
      })
      .sort({ date: -1 })
      .lean();
    });

    const attendanceArrays = await Promise.all(attendancePromises);
    const attendance = attendanceArrays.flat();

    console.log('✅ [STUDENT] Total attendance records:', attendance.length);

    return res.json({
      success: true,
      count: attendance.length,
      attendance: attendance.map(record => ({
        ...formatAttendanceRecord(record),
        teacher: record.teacher ? {
          user: {
            name: record.teacher.user?.name || 'Unknown Teacher'
          }
        } : null,
        class: record.class ? {
          startTime: record.class.startTime,
          endTime: record.class.endTime
        } : null
      }))
    });

  } catch (error) {
    console.error('❌ [STUDENT] Error in getMyAttendance:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @desc    Attendance summary (percentage)
 * @route   GET /api/attendance/summary
 * @access  Private/Student
 */
export const getAttendanceSummary = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const total = await Attendance.countDocuments({ student: student._id });
  const present = await Attendance.countDocuments({
    student: student._id,
    status: 'present',
  });

  const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

  res.json({
    success: true,
    totalClasses: total,
    presentClasses: present,
    attendancePercentage: percentage,
  });
});

/**
 * @desc    Get attendance for specific enrollment (Student)
 * @route   GET /api/attendance/enrollment/:enrollmentId
 * @access  Private/Student
 */
export const getEnrollmentAttendance = asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const enrollment = await getEnrollmentWithVerification(enrollmentId, student._id);

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this enrollment'
      });
    }

    const attendance = await Attendance.find({
      enrollment: enrollmentId,
      student: student._id
    })
    .sort({ date: -1 })
    .lean();

    return res.json({
      success: true,
      count: attendance.length,
      attendance: attendance.map(record => ({
        _id: record._id,
        date: record.date,
        time: record.markedAt ? new Date(record.markedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : 'N/A',
        status: record.status,
        remarks: record.remarks,
        startTime: record.class?.startTime,
        endTime: record.class?.endTime
      }))
    });

  } catch (error) {
    console.error('Error in getEnrollmentAttendance:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @desc    Get attendance summary for specific enrollment
 * @route   GET /api/attendance/enrollment/:enrollmentId/summary
 * @access  Private/Student
 */
export const getEnrollmentAttendanceSummary = asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const enrollment = await getEnrollmentWithVerification(enrollmentId, student._id);

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this enrollment'
      });
    }

    const records = await Attendance.find({
      enrollment: enrollmentId,
      student: student._id
    });

    const stats = calculateAttendanceStats(records);

    return res.json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('Error in getEnrollmentAttendanceSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});