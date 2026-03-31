import asyncHandler from 'express-async-handler';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import Payment from '../../models/Payment.js';
import Student from '../../models/Student.js';
import Attendance from '../../models/Attendance.js';
import Class from '../../models/Class.js';
import Enrollment from '../../models/Enrollment.js';

// @desc    Generate report
// @route   POST /api/admin/reports/generate
// @access  Private/Admin
export const generateReport = asyncHandler(async (req, res) => {
  const { reportType, startDate, endDate, format = 'pdf' } = req.body;

  let data;
  let filename;

  switch (reportType) {
    case 'financial':
      data = await generateFinancialReport(startDate, endDate);
      filename = `financial-report-${Date.now()}`;
      break;
    case 'enrollment':
      data = await generateEnrollmentReport(startDate, endDate);
      filename = `enrollment-report-${Date.now()}`;
      break;
    case 'attendance':
      data = await generateAttendanceReport(startDate, endDate);
      filename = `attendance-report-${Date.now()}`;
      break;
    case 'ulma-performance':
      data = await generateUlmaPerformanceReport(startDate, endDate);
      filename = `ulma-performance-report-${Date.now()}`;
      break;
    default:
      res.status(400);
      throw new Error('Invalid report type');
  }

  if (format === 'pdf') {
    const pdfBuffer = await generatePDF(data, reportType);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);
    res.send(pdfBuffer);
  } else if (format === 'excel') {
    const excelBuffer = await generateExcel(data, reportType);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
    res.send(excelBuffer);
  } else {
    res.json({
      success: true,
      message: 'Report generated successfully',
      data,
    });
  }
});

// @desc    Get student monthly report
// @route   GET /api/admin/students/:studentId/reports/monthly
// @access  Private/Admin
export const getStudentMonthlyReport = asyncHandler(async (req, res) => {
  try {
    const { studentId } = req.params;
    const { month, year } = req.query;

    // Get current month/year if not provided
    const now = new Date();
    const reportMonth = month ? parseInt(month) : now.getMonth() + 1;
    const reportYear = year ? parseInt(year) : now.getFullYear();

    // Get student
    const student = await Student.findById(studentId)
      .populate('user', 'name email')
      .populate({
        path: 'currentUlma',
        populate: {
          path: 'user',
          select: 'name email'
        }
      });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Date range for the month
    const startDate = new Date(reportYear, reportMonth - 1, 1);
    const endDate = new Date(reportYear, reportMonth, 0, 23, 59, 59);

    // Get enrollment
    const enrollment = await Enrollment.findOne({
      student: student._id,
      status: { $in: ['approved', 'active'] }
    }).populate('ulma', 'user').populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email'
      }
    });

    // Get classes for the month
    const classes = await Class.find({
      student: student._id,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });

    // Get attendance for the month
    const attendanceRecords = await Attendance.find({
      student: student._id,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).populate('class', 'date startTime endTime').sort({ date: 1 });

    // Calculate attendance stats
    const totalClasses = classes.length;
    const presentCount = attendanceRecords.filter(a => a.status === 'present').length;
    const absentCount = attendanceRecords.filter(a => a.status === 'absent').length;
    const lateCount = attendanceRecords.filter(a => a.status === 'late').length;
    const attendancePercentage = totalClasses > 0
      ? Math.round((presentCount / totalClasses) * 100)
      : 0;

    // Daily attendance breakdown
    const dailyAttendance = classes.map(cls => {
      const attendance = attendanceRecords.find(a =>
        a.class && a.class._id.toString() === cls._id.toString()
      );
      return {
        date: cls.date,
        startTime: cls.startTime,
        endTime: cls.endTime,
        status: cls.status,
        attendance: attendance ? attendance.status : 'not_marked',
        remarks: attendance ? attendance.remarks : null
      };
    });

    res.json({
      success: true,
      report: {
        student: {
          name: student.user.name,
          email: student.user.email,
          course: enrollment?.course || student.currentCourse
        },
        teacher: enrollment?.ulma ? {
          name: enrollment.ulma.user.name,
          email: enrollment.ulma.user.email
        } : null,
        period: {
          month: reportMonth,
          year: reportYear,
          monthName: new Date(reportYear, reportMonth - 1).toLocaleString('default', { month: 'long' })
        },
        attendance: {
          totalClasses,
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          attendancePercentage
        },
        dailyAttendance,
        enrollment: enrollment ? {
          status: enrollment.status,
          monthlyFee: enrollment.monthlyFee,
          schedule: enrollment.schedule
        } : null
      }
    });

  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating monthly report',
      error: error.message
    });
  }
});

// Helper functions for reports
const generateFinancialReport = async (startDate, endDate) => {
  const matchQuery = {};

  if (startDate && endDate) {
    matchQuery.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const payments = await Payment.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          month: { $month: '$createdAt' },
          year: { $year: '$createdAt' },
          status: '$status',
          method: '$method',
        },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const summary = await Payment.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        completedRevenue: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] },
        },
        pendingRevenue: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] },
        },
        totalTransactions: { $sum: 1 },
      },
    },
  ]);

  return {
    payments,
    summary: summary[0] || {},
    period: { startDate, endDate },
  };
};

const generateEnrollmentReport = async (startDate, endDate) => {
  const matchQuery = {};

  if (startDate && endDate) {
    matchQuery.enrollmentDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const enrollments = await Student.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          course: '$currentCourse',
          month: { $month: '$enrollmentDate' },
          year: { $year: '$enrollmentDate' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const courseDistribution = await Student.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$currentCourse',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const totalEnrollments = await Student.countDocuments(matchQuery);

  return {
    enrollments,
    courseDistribution,
    totalEnrollments,
    period: { startDate, endDate },
  };
};

const generateAttendanceReport = async (startDate, endDate) => {
  const matchQuery = {};

  if (startDate && endDate) {
    matchQuery.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const attendanceStats = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          month: { $month: '$date' },
          year: { $year: '$date' },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const totalAttendance = await Attendance.countDocuments(matchQuery);
  const presentCount = await Attendance.countDocuments({
    ...matchQuery,
    status: 'present',
  });
  const absentCount = await Attendance.countDocuments({
    ...matchQuery,
    status: 'absent',
  });
  const lateCount = await Attendance.countDocuments({
    ...matchQuery,
    status: 'late',
  });

  const overallAttendanceRate =
    totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

  return {
    attendanceStats,
    summary: {
      totalAttendance,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      overallAttendanceRate,
    },
    period: { startDate, endDate },
  };
};

const generateUlmaPerformanceReport = async (startDate, endDate) => {
  // Similar implementation
  return {};
};

const generatePDF = async (data, reportType) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Add report header
    doc.fontSize(20).text('Quran Academy - Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Report Type: ${reportType}`, { align: 'center' });
    doc.moveDown();

    // Add report content based on type
    if (reportType === 'financial') {
      doc.fontSize(16).text('Financial Summary');
      doc.moveDown();

      const summary = data.summary;
      doc.fontSize(12).text(`Total Revenue: $${summary.totalRevenue || 0}`);
      doc.text(`Completed Revenue: $${summary.completedRevenue || 0}`);
      doc.text(`Pending Revenue: $${summary.pendingRevenue || 0}`);
      doc.text(`Total Transactions: ${summary.totalTransactions || 0}`);
    }

    doc.end();
  });
};

const generateExcel = async (data, reportType) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  // Add headers based on report type
  if (reportType === 'financial') {
    worksheet.columns = [
      { header: 'Month', key: 'month', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Method', key: 'method', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Count', key: 'count', width: 15 },
    ];

    // Add data
    data.payments.forEach(payment => {
      worksheet.addRow({
        month: `${payment._id.month}/${payment._id.year}`,
        status: payment._id.status,
        method: payment._id.method,
        amount: payment.amount,
        count: payment.count,
      });
    });
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};