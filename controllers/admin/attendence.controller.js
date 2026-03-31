// import asyncHandler from 'express-async-handler';
// import Attendance from '../../models/Attendance.js';
// import Student from '../../models/Student.js';
// import Teacher from '../../models/Teacher.js';
// import Enrollment from '../../models/Enrollment.js';
// import { 
//   formatAttendanceRecord, 
//   calculateAttendanceStats 
// } from '../shared/attendanceUtils.js';

// /**
//  * @desc    Get all attendance records (Admin)
//  * @route   GET /api/attendance/all
//  * @access  Private/Admin
//  */
// export const getAllAttendance = asyncHandler(async (req, res) => {
//   try {
//     const { page = 1, limit = 50, status, startDate, endDate, studentId, teacherId } = req.query;
    
//     const query = {};
    
//     if (status) query.status = status;
//     if (studentId) query.student = studentId;
//     if (teacherId) query.teacher = teacherId;
    
//     if (startDate || endDate) {
//       query.date = {};
//       if (startDate) query.date.$gte = new Date(startDate);
//       if (endDate) query.date.$lte = new Date(endDate);
//     }
    
//     const skip = (parseInt(page) - 1) * parseInt(limit);
    
//     const [attendance, total] = await Promise.all([
//       Attendance.find(query)
//         .populate('student', 'user')
//         .populate('teacher', 'user')
//         .populate({
//           path: 'student',
//           populate: {
//             path: 'user',
//             select: 'name email'
//           }
//         })
//         .populate({
//           path: 'teacher',
//           populate: {
//             path: 'user',
//             select: 'name email'
//           }
//         })
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(parseInt(limit))
//         .lean(),
//       Attendance.countDocuments(query)
//     ]);
    
//     res.json({
//       success: true,
//       total,
//       page: parseInt(page),
//       pages: Math.ceil(total / parseInt(limit)),
//       attendance: attendance.map(record => formatAttendanceRecord(record))
//     });
    
//   } catch (error) {
//     console.error('Error in getAllAttendance:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// /**
//  * @desc    Get attendance statistics (Admin)
//  * @route   GET /api/attendance/stats
//  * @access  Private/Admin
//  */
// export const getAttendanceStats = asyncHandler(async (req, res) => {
//   try {
//     const { startDate, endDate } = req.query;
    
//     const query = {};
    
//     if (startDate || endDate) {
//       query.date = {};
//       if (startDate) query.date.$gte = new Date(startDate);
//       if (endDate) query.date.$lte = new Date(endDate);
//     }
    
//     const [totalRecords, presentCount, absentCount, lateCount, students, teachers] = await Promise.all([
//       Attendance.countDocuments(query),
//       Attendance.countDocuments({ ...query, status: 'present' }),
//       Attendance.countDocuments({ ...query, status: 'absent' }),
//       Attendance.countDocuments({ ...query, status: 'late' }),
//       Student.countDocuments(),
//       Teacher.countDocuments()
//     ]);
    
//     const presentPercentage = totalRecords > 0 
//       ? Math.round((presentCount / totalRecords) * 100) 
//       : 0;
    
//     res.json({
//       success: true,
//       stats: {
//         totalRecords,
//         presentCount,
//         absentCount,
//         lateCount,
//         presentPercentage,
//         totalStudents: students,
//         totalTeachers: teachers
//       }
//     });
    
//   } catch (error) {
//     console.error('Error in getAttendanceStats:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// /**
//  * @desc    Get attendance by student (Admin)
//  * @route   GET /api/attendance/admin/student/:studentId
//  * @access  Private/Admin
//  */
// export const getStudentAttendanceAdmin = asyncHandler(async (req, res) => {
//   try {
//     const { studentId } = req.params;
//     const { page = 1, limit = 50 } = req.query;
    
//     const student = await Student.findById(studentId).populate('user', 'name email');
    
//     if (!student) {
//       return res.status(404).json({
//         success: false,
//         message: 'Student not found'
//       });
//     }
    
//     const skip = (parseInt(page) - 1) * parseInt(limit);
    
//     const [attendance, total] = await Promise.all([
//       Attendance.find({ student: studentId })
//         .populate('teacher', 'user')
//         .populate({
//           path: 'teacher',
//           populate: {
//             path: 'user',
//             select: 'name email'
//           }
//         })
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(parseInt(limit))
//         .lean(),
//       Attendance.countDocuments({ student: studentId })
//     ]);
    
//     const stats = calculateAttendanceStats(attendance);
    
//     res.json({
//       success: true,
//       student: {
//         _id: student._id,
//         name: student.user?.name,
//         email: student.user?.email
//       },
//       stats,
//       total,
//       page: parseInt(page),
//       pages: Math.ceil(total / parseInt(limit)),
//       attendance: attendance.map(record => formatAttendanceRecord(record))
//     });
    
//   } catch (error) {
//     console.error('Error in getStudentAttendanceAdmin:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// /**
//  * @desc    Get attendance by teacher (Admin)
//  * @route   GET /api/attendance/admin/teacher/:teacherId
//  * @access  Private/Admin
//  */
// export const getTeacherAttendanceAdmin = asyncHandler(async (req, res) => {
//   try {
//     const { teacherId } = req.params;
//     const { page = 1, limit = 50 } = req.query;
    
//     const teacher = await Teacher.findById(teacherId).populate('user', 'name email');
    
//     if (!teacher) {
//       return res.status(404).json({
//         success: false,
//         message: 'Teacher not found'
//       });
//     }
    
//     const skip = (parseInt(page) - 1) * parseInt(limit);
    
//     const [attendance, total] = await Promise.all([
//       Attendance.find({ teacher: teacherId })
//         .populate('student', 'user')
//         .populate({
//           path: 'student',
//           populate: {
//             path: 'user',
//             select: 'name email'
//           }
//         })
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(parseInt(limit))
//         .lean(),
//       Attendance.countDocuments({ teacher: teacherId })
//     ]);
    
//     const stats = calculateAttendanceStats(attendance);
    
//     res.json({
//       success: true,
//       teacher: {
//         _id: teacher._id,
//         name: teacher.user?.name,
//         email: teacher.user?.email
//       },
//       stats,
//       total,
//       page: parseInt(page),
//       pages: Math.ceil(total / parseInt(limit)),
//       attendance: attendance.map(record => formatAttendanceRecord(record))
//     });
    
//   } catch (error) {
//     console.error('Error in getTeacherAttendanceAdmin:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });