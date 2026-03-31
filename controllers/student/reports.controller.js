import asyncHandler from 'express-async-handler';
import Student from '../../models/Student.js';
import Enrollment from '../../models/Enrollment.js';
import Class from '../../models/Class.js';
import Attendance from '../../models/Attendance.js';
import Assignment from '../../models/Assignment.js';

// @desc    Get monthly report for student
// @route   GET /api/students/reports/monthly
// @access  Private/Student
export const getMonthlyReport = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const now = new Date();
  const reportMonth = month ? parseInt(month) : now.getMonth() + 1;
  const reportYear = year ? parseInt(year) : now.getFullYear();

  const startDate = new Date(reportYear, reportMonth - 1, 1);
  const endDate = new Date(reportYear, reportMonth, 0, 23, 59, 59);

  const student = await Student.findOne({ user: req.user.id })
    .populate('user', 'name email');

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  // 🔑 STEP 1: Get ALL active enrollments
  const enrollments = await Enrollment.find({
    student: student._id,
    status: { $in: ['approved', 'active'] }
  })
    .populate('course', 'name')
    .populate({
      path: 'ulma',
      populate: { path: 'user', select: 'name email' }
    });

  // 🔑 STEP 2: Build report per enrollment
  const enrollmentReports = [];

  for (const enrollment of enrollments) {
    // Classes of this enrollment
    const classes = await Class.find({
      enrollment: enrollment._id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    // Attendance of this enrollment
    const attendanceRecords = await Attendance.find({
      enrollment: enrollment._id,
      date: { $gte: startDate, $lte: endDate }
    });

    const totalClasses = classes.length;
    const present = attendanceRecords.filter(a => a.status === 'present').length;
    const absent = attendanceRecords.filter(a => a.status === 'absent').length;
    const late = attendanceRecords.filter(a => a.status === 'late').length;

    const attendancePercentage =
      totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 0;

    // Assignments per course (if linked by course)
    const assignments = await Assignment.find({
      student: student._id,
      course: enrollment.course._id,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const dailyAttendance = classes.map(cls => {
      const att = attendanceRecords.find(
        a => a.date.toISOString() === cls.date.toISOString()
      );

      return {
        date: cls.date,
        startTime: cls.startTime,
        endTime: cls.endTime,
        status: cls.status,
        attendance: att ? att.status : 'not_marked',
        remarks: att?.remarks || null
      };
    });

    enrollmentReports.push({
      course: {
        _id: enrollment.course._id,
        name: enrollment.course.name
      },
      teacher: enrollment.ulma
        ? {
          name: enrollment.ulma.user.name,
          email: enrollment.ulma.user.email
        }
        : null,
      attendance: {
        totalClasses,
        present,
        absent,
        late,
        attendancePercentage
      },
      assignments: {
        total: assignments.length,
        completed: assignments.filter(a => a.status === 'completed').length,
        pending: assignments.filter(a => a.status === 'pending').length
      },
      progress: {
        currentPara: student.progress.currentPara || 1,
        currentSurah: student.progress.currentSurah || 'Al-Fatiha',
        ayatCompleted: student.progress.ayatCompleted || 0
      },
      dailyAttendance
    });
  }

  // 🔑 STEP 3: Final response (MATCHES FRONTEND)
  res.json({
    success: true,
    report: {
      student: {
        name: student.user.name,
        email: student.user.email
      },
      period: {
        month: reportMonth,
        year: reportYear,
        monthName: new Date(reportYear, reportMonth - 1).toLocaleString(
          'default',
          { month: 'long' }
        )
      },
      enrollments: enrollmentReports
    }
  });
});

// @desc    Get attendance summary
// @route   GET /api/students/reports/attendance
// @access  Private/Student
export const getAttendanceSummary = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  const { months = 6 } = req.query;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const attendanceData = await Attendance.aggregate([
    {
      $match: {
        student: student._id,
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  res.json({
    success: true,
    attendance: attendanceData
  });
});