import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import * as ulmaController from '../controllers/ulma/index.js';

const router = express.Router();

// All routes require authentication and ulma role
router.use(protect);
router.use(authorize('ulma'));

// ============================================
// 📊 Dashboard Routes
// ============================================
router.get('/dashboard', ulmaController.getDashboardData);

// ============================================
// 👤 Profile Routes
// ============================================
router.route('/profile')
  .get(ulmaController.getUlmaProfile)
  .put(upload.single('profileImage'), ulmaController.updateUlmaProfile);

router.post('/upload-profile-image', 
  upload.single('profileImage'), 
  ulmaController.uploadProfileImage
);

// ============================================
// 👥 Student Management Routes
// ============================================
router.get('/students', ulmaController.getUlmaStudents);
router.get('/students/:id', ulmaController.getStudentDetails);
router.put('/students/:id/progress', ulmaController.updateStudentProgress);

// ============================================
// � Course Routes
// ============================================
router.get('/courses', ulmaController.getAllCourses);

// ============================================
// �💬 Chat Routes
// ============================================
router.get('/chat/:conversationId', ulmaController.getConversationDetails);
router.route('/classes')
  .post(ulmaController.createClass);

router.route('/classes/:id')
  .get(ulmaController.getClass)
  .put(ulmaController.updateClass)
  .delete(ulmaController.deleteClass);

router.post('/classes/:id/attendance', ulmaController.markAttendance);
router.post('/classes/:id/start', ulmaController.startLiveClass);
router.post('/classes/:id/end', ulmaController.endLiveClass);

// ============================================
// � Chat Routes
// ============================================
router.get('/chat/:conversationId', ulmaController.getConversationById);

// ============================================
// �📅 Schedule & Timetable Routes
// ============================================
router.get('/schedule', ulmaController.getUlmaSchedule);
router.get('/timetable/events', ulmaController.getTimetableEvents);

// ============================================
// ⏰ Availability Routes
// ============================================
router.route('/availability')
  .get(ulmaController.getAvailability)
  .put(ulmaController.updateAvailability);

// ============================================
// 💰 Earnings & Performance Routes
// ============================================
router.get('/earnings', ulmaController.getEarnings);
router.get('/performance', ulmaController.getPerformance);

// ============================================
// 🔔 Notification Routes
// ============================================
router.get('/notifications', ulmaController.getNotifications);
router.put('/notifications/:id/read', ulmaController.markNotificationAsRead);

// ============================================
// 📚 Enrollments Routes
// ============================================
router.get('/enrollments', ulmaController.getUlmaEnrollments);

export default router;