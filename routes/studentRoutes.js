import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import * as studentController from '../controllers/student/index.js';
import { getStudentAssignments, submitAssignment } from '../controllers/assignmentController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ============================================
// 👤 Profile Routes
// ============================================
router.get('/by-user/:userId', studentController.getStudentByUserId);
router.route('/profile')
  .get(studentController.getProgress) // Student ka apna progress
  .put(upload.single('profileImage'), studentController.updateStudentProfile);

// ============================================
// 📚 Courses Routes
// ============================================
router.get('/courses', studentController.getAllCourses);
router.get('/courses/:id', studentController.getCourseById);

// ============================================
// 🧑‍🏫 Ulma Routes
// ============================================
router.get('/ulma/available', studentController.getAvailableUlma);
router.get('/ulma/:id', studentController.getUlmaDetails);

// ============================================
// 📝 Enrollment Routes
// ============================================
router.post('/enroll', studentController.requestEnrollment);
router.get('/enroll/my-enrollments', studentController.getMyEnrollments);
router.get('/enrollments/:id', studentController.getEnrollmentDetails);
router.put('/enrollments/:id/cancel', studentController.cancelEnrollment);

// ============================================
// 💰 Fees & Payment Routes
// ============================================
router.get('/fees/pending', studentController.getPendingFees);
router.get('/fees/history', studentController.getPaymentHistory);
router.post('/fees/pay', studentController.processPayment);
router.get('/fees/:id/invoice', studentController.downloadInvoice);

// ============================================
// 🎓 Classes Routes
// ============================================
router.get('/classes', studentController.getStudentClasses);
router.get('/classes/upcoming', studentController.getUpcomingClasses);
router.get('/classes/:id', studentController.getClassDetails);

// ============================================
// 📊 Dashboard & Stats Routes
// ============================================
router.get('/stats', studentController.getStudentStats);
router.get('/recent-activity', studentController.getRecentActivity);

// ============================================
// � Assignment Routes
// ============================================
router.get('/assignments', getStudentAssignments);
router.put('/assignments/:id/submit', submitAssignment);
router.route('/progress')
  .get(studentController.getProgress)
  .put(studentController.updateProgress);

router.post('/progress/notes', studentController.addProgressNote);

// ============================================
// 📋 Reports Routes
// ============================================
router.get('/reports/monthly', studentController.getMonthlyReport);
router.get('/reports/attendance', studentController.getAttendanceSummary);

// ============================================
// ⚙️ Preferences Routes
// ============================================
router.put('/:id/preferences', studentController.updateStudentPreferences);

// ============================================
// 👥 Admin Only Routes
// ============================================
router.get('/', authorize('admin'), studentController.getStudents);
router.get('/:id', authorize('admin', 'ulma'), studentController.getStudentById);

export default router;