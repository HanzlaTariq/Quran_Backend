import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import Student from '../../models/Student.js';
import User from '../../models/User.js';
import Class from '../../models/Class.js';
import Enrollment from '../../models/Enrollment.js';

// @desc    Get ulma's students
// @route   GET /api/ulma/students
// @access  Private/Ulma
export const getUlmaStudents = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  const { status, search, page = 1, limit = 10 } = req.query;

  let query = { currentUlma: ulma._id };

  if (status === 'active') {
    query['subscription.isActive'] = true;
  } else if (status === 'inactive') {
    query['subscription.isActive'] = false;
  }

  if (search) {
    const users = await User.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }).select('_id');

    query.user = { $in: users.map(u => u._id) };
  }

  const students = await Student.find(query)
    .populate('user', 'name email phone country profileImage')
    .populate('currentCourse', 'name')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ enrollmentDate: -1 });

  const total = await Student.countDocuments(query);

  // Get progress for each student
  const studentsWithProgress = await Promise.all(students.map(async (student) => {
    const classes = await Class.find({
      student: student._id,
      status: 'completed'
    });

    const attendance = classes.filter(c => c.attendance).length;
    const totalClasses = classes.length;
    const attendanceRate = totalClasses > 0 ? (attendance / totalClasses) * 100 : 0;

    const lastClass = await Class.findOne({
      student: student._id,
      status: 'completed'
    }).sort({ date: -1 });

    // Get all courses for this student with this ulma
    const enrollments = await Enrollment.find({ student: student._id, ulma: ulma._id })
      .populate('course', 'name');
    const courses = enrollments.map(e => e.course?.name).filter(Boolean);

    return {
      ...student._doc,
      courses,
      progress: {
        ...student.progress,
        attendanceRate,
        totalClasses,
        attendedClasses: attendance,
        lastClass: lastClass?.date,
        currentPara: student.progress?.currentPara || 1,
        percentage: ((student.progress?.currentPara || 1) * 3.33) // 30 paras = 100%
      },
    };
  }));

  res.json({
    students: studentsWithProgress,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get student details
// @route   GET /api/ulma/students/:id
// @access  Private/Ulma
export const getStudentDetails = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const student = await Student.findById(req.params.id)
    .populate('user', 'name email phone country timezone languages profileImage')
    .populate('currentUlma');

  if (!student || student.currentUlma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Student not found or not assigned to you');
  }

  // Get student's classes
  const classes = await Class.find({ student: student._id })
    .sort({ date: -1 })
    .limit(20);

  // Get attendance statistics
  const completedClasses = classes.filter(c => c.status === 'completed');
  const attendance = completedClasses.filter(c => c.attendance).length;
  const attendanceRate = completedClasses.length > 0 ? (attendance / completedClasses.length) * 100 : 0;

  // Get recent progress
  const recentProgress = classes
    .filter(c => c.progress?.remarks)
    .map(c => ({
      date: c.date,
      remarks: c.progress.remarks,
      paraCompleted: c.progress.paraCompleted,
      surahCompleted: c.progress.surahCompleted,
    }))
    .slice(0, 10);

  res.json({
    student: student._doc,
    statistics: {
      totalClasses: classes.length,
      completedClasses: completedClasses.length,
      attendanceRate,
      attendance,
      enrollmentDate: student.enrollmentDate,
    },
    recentProgress,
    classes: classes.slice(0, 10),
  });
});

// @desc    Update student progress
// @route   PUT /api/ulma/students/:id/progress
// @access  Private/Ulma
export const updateStudentProgress = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const student = await Student.findById(req.params.id);

  if (!student || student.currentUlma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Student not found or not assigned to you');
  }

  const { currentPara, currentSurah, ayatCompleted, remarks } = req.body;

  // Update student progress
  student.progress.currentPara = currentPara || student.progress.currentPara;
  student.progress.currentSurah = currentSurah || student.progress.currentSurah;
  student.progress.ayatCompleted = ayatCompleted || student.progress.ayatCompleted;

  // Add progress remark
  if (remarks) {
    student.progress.remarks = student.progress.remarks || [];
    student.progress.remarks.push({
      date: new Date(),
      remark: remarks,
      addedBy: req.user.id,
    });
  }

  await student.save();

  res.json({
    success: true,
    message: 'Student progress updated successfully',
    progress: student.progress,
  });
});

// @desc    Get conversation by id
// @route   GET /api/ulma/chat/:conversationId
// @access  Private/Ulma
export const getConversationById = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.conversationId);

  if (!conversation || conversation.ulmaId.toString() !== req.user.id.toString()) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  // Get student details
  const student = await Student.findOne({ user: conversation.studentId }).populate('user', 'name email');

  res.json({
    conversation,
    student: student?.user
  });
});