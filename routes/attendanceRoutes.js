// 





import express from 'express';
import {
  markAttendance,
  getClassAttendance,
  getClassStudents,
  getUlmaStudentsAttendance,
  getMyAttendance,
  getAttendanceSummary,
  getEnrollmentAttendance,           
  getEnrollmentAttendanceSummary,
  getStudentAttendanceRecords,
  updateAttendance
} from '../controllers/attendanceController.js';

import { protect } from '../middleware/auth.js';
import { ulmaOnly, studentOnly } from '../middleware/roleMiddleware.js';

const router = express.Router();

/**
 * Ulma Routes
 */
router.post('/mark', protect, ulmaOnly, markAttendance);

router.get(
  '/class/:classId',
  protect,
  ulmaOnly,
  getClassAttendance
);

router.get(
  '/class/:classId/students',
  protect,
  ulmaOnly,
  getClassStudents
);

router.get(
  '/ulma/students',
  protect,
  ulmaOnly,
  getUlmaStudentsAttendance
);

router.get(
  '/student/:studentId',
  protect,
  ulmaOnly,
  getStudentAttendanceRecords
);

router.put(
  '/:attendanceId',
  protect,
  ulmaOnly,
  updateAttendance
);

/**
 * Student Routes
 */
router.get(
  '/my',
  protect,
  studentOnly,
  getMyAttendance
);

router.get(
  '/summary',
  protect,
  studentOnly,
  getAttendanceSummary
);

router.get(
  '/enrollment/:enrollmentId',
  protect,
  studentOnly,
  getEnrollmentAttendance
);
router.get(
  '/enrollment/:enrollmentId/summary',
  protect,
  studentOnly,
  getEnrollmentAttendanceSummary
);

export default router;