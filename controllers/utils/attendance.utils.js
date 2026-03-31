import Attendance from '../../models/Attendance.js';
import Student from '../../models/Student.js';
import Enrollment from '../../models/Enrollment.js';

/**
 * Update student progress based on attendance records
 */
export const updateStudentProgress = async (studentId, enrollmentId) => {
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
};

/**
 * Normalize date to start of day
 */
export const normalizeDate = (date) => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
};

/**
 * Format attendance record for response
 */
export const formatAttendanceRecord = (record) => ({
  _id: record._id,
  date: record.date,
  time: record.markedAt 
    ? new Date(record.markedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    : 'N/A',
  status: record.status,
  remarks: record.remarks,
  markedAt: record.markedAt,
  markedBy: record.markedBy?.name || 'Unknown',
  teacher: record.teacher,
  class: record.class
});

/**
 * Calculate attendance statistics
 */
export const calculateAttendanceStats = (records) => {
  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const late = records.filter(r => r.status === 'late').length;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  
  return { total, present, absent, late, percentage };
};

/**
 * Verify teacher owns the enrollment
 */
export const verifyTeacherAccess = async (teacherId, enrollmentId, studentId) => {
  const enrollment = await Enrollment.findOne({
    _id: enrollmentId,
    teacher: teacherId,
    student: studentId,
  });
  
  return enrollment;
};

/**
 * Get enrollment by ID with verification
 */
export const getEnrollmentWithVerification = async (enrollmentId, studentId, teacherId = null) => {
  const query = {
    _id: enrollmentId,
    student: studentId,
  };
  
  if (teacherId) {
    query.teacher = teacherId;
  }
  
  return await Enrollment.findOne(query);
};