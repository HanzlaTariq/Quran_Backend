import asyncHandler from 'express-async-handler';
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Enrollment from '../models/Enrollment.js';
import Ulma from '../models/Ulma.js';

/**
 * @desc    Mark attendance (Ulma) - SIMPLIFIED & FIXED
 * @route   POST /api/attendance/mark
 * @access  Private/Ulma
 */
export const markAttendance = asyncHandler(async (req, res) => {
  const { studentId, enrollmentId, date, status, remarks, markedAt } = req.body;

  if (!studentId || !enrollmentId || !date) {
    return res.status(400).json({
      success: false,
      message: 'Student, Enrollment and Date are required',
    });
  }

  // 1️⃣ Get Ulma
  const ulma = await Ulma.findOne({ user: req.user.id });
  if (!ulma) {
    return res.status(404).json({
      success: false,
      message: 'Ulma not found',
    });
  }

  // 2️⃣ Verify enrollment belongs to this ulma & student
  const enrollment = await Enrollment.findOne({
    _id: enrollmentId,
    ulma: ulma._id,
    student: studentId,
  });

  if (!enrollment) {
    return res.status(403).json({
      success: false,
      message: 'Enrollment not found or not authorized',
    });
  }

  // 3️⃣ Normalize date (VERY IMPORTANT)
  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  // 4️⃣ UPSERT attendance (NO DUPLICATE ERROR EVER)
  const attendance = await Attendance.findOneAndUpdate(
    {
      enrollment: enrollmentId,
      date: attendanceDate,
    },
    {
      student: studentId,
      ulma: ulma._id,
      status: status || 'present',
      remarks: remarks || '',
      markedAt: markedAt ? new Date(markedAt) : new Date(),
      markedBy: req.user.id,
    },
    {
      upsert: true,
      new: true,
    }
  );

  // 5️⃣ Link class record attendance (if class exists at this student/date or adjacent dates)
  const classDateStart = new Date(attendanceDate);
  classDateStart.setHours(0, 0, 0, 0);

  // Look for class on the attendance date, or the day before, or the day after
  let classItem = await Class.findOne({
    student: studentId,
    ulma: ulma._id,
    date: classDateStart,
  });

  if (!classItem) {
    // Check day before
    const dayBefore = new Date(classDateStart);
    dayBefore.setDate(dayBefore.getDate() - 1);
    classItem = await Class.findOne({
      student: studentId,
      ulma: ulma._id,
      date: dayBefore,
    });
  }

  if (!classItem) {
    // Check day after
    const dayAfter = new Date(classDateStart);
    dayAfter.setDate(dayAfter.getDate() + 1);
    classItem = await Class.findOne({
      student: studentId,
      ulma: ulma._id,
      date: dayAfter,
    });
  }

  if (classItem) {
    classItem.attendance = attendance._id;
    await classItem.save();
  }

  // 6️⃣ Update student progress (per enrollment)
  const allAttendance = await Attendance.find({
    enrollment: enrollmentId,
  });

  const presentCount = allAttendance.filter(a => a.status === 'present').length;
  const totalCount = allAttendance.length;

  await Student.findByIdAndUpdate(studentId, {
    'progress.attendancePercentage':
      totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
    'progress.totalClasses': totalCount,
  });

  return res.status(201).json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
  });
});


/**
 * @desc    Get attendance for a class (Ulma)
 * @route   GET /api/attendance/class/:classId
 * @access  Private/Ulma
 */
export const getClassAttendance = asyncHandler(async (req, res) => {
  const { classId } = req.params;

  // Verify ulma owns this class
  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(classId);

  if (!ulma || !classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const attendance = await Attendance.find({ class: classId })
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email',
      },
    })
    .sort({ date: -1 });

  res.json({
    success: true,
    attendance,
  });
});

/**
 * @desc    Get all students for a class (Ulma)
 * @route   GET /api/attendance/class/:classId/students
 * @access  Private/Ulma
 */
export const getClassStudents = asyncHandler(async (req, res) => {
  const { classId } = req.params;

  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(classId)
    .populate('student', 'user')
    .populate('enrollment');

  if (!ulma || !classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // Get enrollment to find all students in this course
  const enrollment = await Enrollment.findById(classItem.enrollment);

  // For now, return single student (1-on-1 class)
  // Later can be extended for group classes
  const student = await Student.findById(classItem.student)
    .populate('user', 'name email');

  res.json({
    success: true,
    students: student ? [{
      _id: student._id,
      user: student.user,
      enrollmentId: enrollment?._id
    }] : []
  });
});

/**
 * @desc    Get all attendance for ulma's students
 * @route   GET /api/attendance/ulma/students
 * @access  Private/Ulma
 */
export const getUlmaStudentsAttendance = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 [BACKEND] Fetching students for Ulma user:', req.user.id);
    
    // 1. Get Ulma
    const ulma = await Ulma.findOne({ user: req.user.id });
    console.log('🔍 [BACKEND] Ulma found:', ulma?._id);
    
    if (!ulma) {
      return res.status(404).json({
        success: false,
        message: 'Ulma profile not found'
      });
    }

    // 2. Get enrollments - use try-catch for populate
    let enrollments;
    try {
      enrollments = await Enrollment.find({
        ulma: ulma._id,
        status: { $in: ['approved', 'active'] }
      })
      .populate({
        path: 'student',
        select: '_id user',
        populate: {
          path: 'user',
          select: 'name email'
        }
      })
      .populate('course', 'name')
      .lean();
    } catch (populateError) {
      console.error('❌ [BACKEND] Populate error:', populateError);
      // Try without populate first
      enrollments = await Enrollment.find({
        ulma: ulma._id,
        status: { $in: ['approved', 'active'] }
      }).lean();
    }

    console.log('📊 [BACKEND] Raw enrollments count:', enrollments.length);
    
    // Debug: Log first enrollment
    if (enrollments.length > 0) {
      console.log('🔍 [BACKEND] First enrollment sample:', JSON.stringify(enrollments[0], null, 2));
    }

    // If no enrollments, return empty array
    if (enrollments.length === 0) {
      return res.json({
        success: true,
        message: 'No active enrollments found',
        students: []
      });
    }

    // 3. Process each enrollment
    const studentsWithAttendance = [];
    
    for (const enrollment of enrollments) {
      try {
        // Check if student exists
        if (!enrollment.student) {
          console.log('⚠️ [BACKEND] Enrollment without student:', enrollment._id);
          continue;
        }

        let studentData;
        
        // If student wasn't populated, fetch it separately
        if (typeof enrollment.student === 'string') {
          const student = await Student.findById(enrollment.student)
            .populate('user', 'name email')
            .lean();
          
          if (!student) {
            console.log('⚠️ [BACKEND] Student not found for ID:', enrollment.student);
            continue;
          }
          
          studentData = {
            _id: student._id,
            user: student.user
          };
        } else {
          studentData = enrollment.student;
        }

        // Get attendance records
        const records = await Attendance.find({
          enrollment: enrollment._id
        })
        .sort({ date: -1 })
        .limit(10)
        .lean();

        // Calculate stats
        const total = records.length;
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const late = records.filter(r => r.status === 'late').length;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

        studentsWithAttendance.push({
          student: {
            _id: studentData._id.toString(),
            name: studentData.user?.name || 'Unknown',
            email: studentData.user?.email || '',
            enrollmentId: enrollment._id.toString()
          },
          course: enrollment.course?.name || 'General',
          attendance: {
            total,
            present,
            absent,
            late,
            percentage
          },
          recentRecords: records.map(record => ({
            ...record,
            time: record.markedAt
              ? new Date(record.markedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              : 'N/A'
          }))
        });

      } catch (error) {
        console.error('⚠️ [BACKEND] Error processing enrollment:', enrollment._id, error.message);
        continue; // Skip this enrollment but continue with others
      }
    }

    console.log('✅ [BACKEND] Returning students:', studentsWithAttendance.length);

    return res.json({
      success: true,
      count: studentsWithAttendance.length,
      students: studentsWithAttendance
    });

  } catch (error) {
    console.error('❌ [BACKEND] Critical error in getUlmaStudentsAttendance:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});



/**
 * @desc    Get my attendance (Student)
 * @route   GET /api/attendance/my
 * @access  Private/Student
 */
export const getMyAttendance = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 [STUDENT] Fetching attendance for user:', req.user.id);
    
    // Find student
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      console.log('❌ [STUDENT] Student not found for user:', req.user.id);
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    console.log('✅ [STUDENT] Student found:', student._id);

    // Get all enrollments for this student
    const enrollments = await Enrollment.find({
      student: student._id,
      status: { $in: ['approved', 'active'] }
    })
    .populate('ulma', 'user')
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .lean();

    console.log('📊 [STUDENT] Enrollments found:', enrollments.length);

    // Get attendance from all enrollments
    const attendancePromises = enrollments.map(async (enrollment) => {
      return await Attendance.find({
        enrollment: enrollment._id,
        student: student._id
      })
      .populate('ulma', 'user')
      .populate({
        path: 'ulma',
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
        _id: record._id,
        date: record.date,
        time: record.markedAt ? new Date(record.markedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : 'N/A',
        status: record.status,
        remarks: record.remarks,
        ulma: record.ulma ? {
          user: {
            name: record.ulma.user?.name || 'Unknown Teacher'
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

    // Find student
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Verify enrollment belongs to this student
    const enrollment = await Enrollment.findOne({
      _id: enrollmentId,
      student: student._id
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this enrollment'
      });
    }

    // Get attendance records for this enrollment
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

    // Find student
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Verify enrollment belongs to this student
    const enrollment = await Enrollment.findOne({
      _id: enrollmentId,
      student: student._id
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this enrollment'
      });
    }

    // Get attendance records
    const records = await Attendance.find({
      enrollment: enrollmentId,
      student: student._id
    });

    // Calculate summary
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    return res.json({
      success: true,
      total,
      present,
      absent,
      late,
      percentage
    });

  } catch (error) {
    console.error('Error in getEnrollmentAttendanceSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @desc    Update attendance record (Ulma)
 * @route   PUT /api/attendance/:attendanceId
 * @access  Private/Ulma
 */
export const updateAttendance = asyncHandler(async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { date, time, status, remarks } = req.body;

    console.log('🔄 [ULMA] Updating attendance record:', attendanceId);

    // Get Ulma
    const ulma = await Ulma.findOne({ user: req.user.id });
    if (!ulma) {
      return res.status(404).json({
        success: false,
        message: 'Ulma not found'
      });
    }

    // Prepare update data
    const updateData = {
      status,
      remarks,
      markedAt: new Date() // Update marked time
    };

    // Handle date and time
    if (date) {
      const attendanceDate = new Date(date);
      if (time) {
        // If time is provided, set it on the date
        const [hours, minutes] = time.split(':');
        attendanceDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      } else {
        // If no time, set to start of day
        attendanceDate.setHours(0, 0, 0, 0);
      }
      updateData.date = attendanceDate;
    }

    // Find and update attendance record
    const attendance = await Attendance.findOneAndUpdate(
      {
        _id: attendanceId,
        ulma: ulma._id // Ensure ulma owns this record
      },
      updateData,
      { new: true }
    ).populate('markedBy', 'name');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found or not authorized'
      });
    }

    console.log('✅ [ULMA] Attendance record updated:', attendance._id);

    return res.json({
      success: true,
      message: 'Attendance updated successfully',
      attendance: {
        _id: attendance._id,
        date: attendance.date,
        status: attendance.status,
        remarks: attendance.remarks,
        markedAt: attendance.markedAt,
        markedBy: attendance.markedBy?.name || 'Unknown'
      }
    });

  } catch (error) {
    console.error('Error in updateAttendance:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @desc    Get attendance records for a specific student (Ulma)
 * @route   GET /api/attendance/student/:studentId
 * @access  Private/Ulma
 */
export const getStudentAttendanceRecords = asyncHandler(async (req, res) => {
  try {
    const { studentId } = req.params;
    const { enrollmentId } = req.query;

    console.log('🔍 [ULMA] Fetching attendance records for student:', studentId);

    // Get Ulma
    const ulma = await Ulma.findOne({ user: req.user.id });
    if (!ulma) {
      return res.status(404).json({
        success: false,
        message: 'Ulma not found'
      });
    }

    // Verify the student belongs to this ulma (through enrollment)
    const enrollments = await Enrollment.find({
      student: studentId,
      ulma: ulma._id,
      status: { $in: ['approved', 'active'] }
    });

    if (enrollments.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Student not found or not authorized'
      });
    }

    // If enrollmentId is provided, ensure it belongs to this student + ulma
    if (enrollmentId) {
      const hasEnrollment = enrollments.some(
        (enrollment) => enrollment._id.toString() === enrollmentId
      );

      if (!hasEnrollment) {
        return res.status(403).json({
          success: false,
          message: 'Enrollment not found or not authorized'
        });
      }
    }

    // Get attendance records for this student and ulma
    const attendanceQuery = {
      student: studentId,
      ulma: ulma._id
    };

    if (enrollmentId) {
      attendanceQuery.enrollment = enrollmentId;
    }

    const attendance = await Attendance.find({
      ...attendanceQuery
    })
    .populate('markedBy', 'name')
    .sort({ date: -1 }) // Most recent first
    .limit(50) // Limit to last 50 records
    .lean();

    console.log('📊 [ULMA] Attendance records found:', attendance.length);

    return res.json({
      success: true,
      attendance: attendance.map(record => ({
        _id: record._id,
        date: record.date,
        time: record.markedAt
          ? new Date(record.markedAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          : null,
        status: record.status,
        remarks: record.remarks,
        markedAt: record.markedAt,
        markedBy: record.markedBy?.name || 'Unknown'
      }))
    });

  } catch (error) {
    console.error('Error in getStudentAttendanceRecords:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
