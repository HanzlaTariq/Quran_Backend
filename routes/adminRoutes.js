import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { generateClassesForEnrollment, generateClassesForAllEnrollments } from '../utils/classGenerator.js';

// Import all admin controllers from the new structure
import {
  // Dashboard
  getDashboardStats,
  
  // Users
  getUsers,
  getUserDetails,
  toggleUserActive,
  deleteUser,
  createAdmin,
  
  // Ulma
  getAllUlma,
  getUlmaApprovals,
  approveUlma,
  rejectUlma,
  getUlmaDetails,
  
  // Courses
  getAllCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseById,
  
  // Enrollments
  getAllEnrollments,
  getEnrollmentById,
  approveEnrollment,
  updateEnrollmentStatus,
  deleteEnrollment,
  createEnrollment,
  getEnrollmentStats,
  
  // Payments & Fees
  getPayments,
  getPaymentSummary,
  getAllFees,
  getFeeById,
  
  // Classes
  getAllClasses,
  getClassReports,
  deleteClass,
  getClassById,
  
  // Reports
  generateReport,
  getStudentMonthlyReport,
  
  // Announcements & Settings
  sendAnnouncement,
  getAnnouncements,
  getSystemSettings,
  updateSystemSettings,
  getSystemLogs
} from '../controllers/admin/index.js';

// Note: generateMonthlyFees abhi bhi feeController.js se import kar rahe hain
import {
  getAllFees as getFeesAlt, // Rename to avoid conflict
  generateMonthlyFees
} from '../controllers/feeController.js';

const router = express.Router();

// ============================================
// 🔒 All routes require authentication & admin role
// ============================================
router.use(protect);
router.use(authorize('admin'));

// ============================================
// 📊 Dashboard Routes
// ============================================
router.get('/dashboard/stats', getDashboardStats);

// ============================================
// 👥 User Management Routes
// ============================================
router.route('/users')
  .get(getUsers);

router.route('/users/:id')
  .get(getUserDetails)  // getStudentDetails ab getUserDetails ban gaya
  .delete(deleteUser);

router.put('/users/:id/toggle-active', toggleUserActive);

// Special route for creating admin (maybe restrict this)
router.post("/create-admin", createAdmin);

// ============================================
// 🧑‍🏫 Ulma Management Routes
// ============================================
router.route('/ulma')
  .get(getAllUlma);

router.get('/ulma/pending', getUlmaApprovals);
router.put('/ulma/:id/approve', approveUlma);
router.put('/ulma/:id/reject', rejectUlma);
router.get('/ulma/:id', getUlmaDetails);  // New route for ulma details

// ============================================
// 📚 Course Management Routes
// ============================================
router.route('/courses')
  .get(getAllCourses)
  .post(createCourse);

router.route('/courses/:id')
  .get(getCourseById)  // New route for single course
  .put(updateCourse)
  .delete(deleteCourse);

// ============================================
// 📝 Enrollment Management Routes
// ============================================
router.get('/enrollments/stats', getEnrollmentStats);  // New route for stats

router.route('/enrollments')
  .get(getAllEnrollments)
  .post(createEnrollment);

router.route('/enrollments/:id')
  .get(getEnrollmentById)  // New route for single enrollment
  .delete(deleteEnrollment);

router.put('/enrollments/:id/status', updateEnrollmentStatus);
router.put('/enrollments/:id/approve', approveEnrollment);

// ============================================
// 💰 Payment & Fee Management Routes
// ============================================
router.route('/payments')
  .get(getPayments);

router.get('/payments/summary', getPaymentSummary);

// Fee routes - note: getAllFees ko rename karna parega agar conflict ho
router.route('/fees')
  .get(getAllFees);  // Ye admin controller se hai

// Agar feeController.js ka getAllFees use karna hai toh:
// router.get('/fees', getFeesAlt);

router.get('/fees/:id', getFeeById);  // New route for single fee
router.post('/fees/generate-monthly', generateMonthlyFees);  // feeController se

// ============================================
// 🎓 Class Management Routes
// ============================================
router.route('/classes')
  .get(getAllClasses);

router.get('/classes/reports', getClassReports);

router.route('/classes/:id')
  .get(getClassById)  // New route for single class
  .delete(deleteClass);

// ============================================
// 📈 Reports Routes
// ============================================
router.post('/reports/generate', generateReport);
router.get('/students/:studentId/reports/monthly', getStudentMonthlyReport);

// ============================================
// 📢 Announcements Routes
// ============================================
router.route('/announcements')
  .get(getAnnouncements)
  .post(sendAnnouncement);

// ============================================
// ⚙️ Settings Routes
// ============================================
router.route('/settings')
  .get(getSystemSettings)
  .put(updateSystemSettings);

// ============================================
// 📋 System Logs Routes
// ============================================
router.get('/logs', getSystemLogs);

// ============================================
// 🏫 Class Generation Routes
// ============================================
router.post('/enrollments/:id/generate-classes', async (req, res) => {
  try {
    const result = await generateClassesForEnrollment(req.params.id);
    if (result.success) {
      res.json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/generate-all-classes', async (req, res) => {
  try {
    const result = await generateClassesForAllEnrollments();
    if (result.success) {
      res.json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;