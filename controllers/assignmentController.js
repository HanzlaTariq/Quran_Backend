import asyncHandler from 'express-async-handler';
import Assignment from '../models/Assignment.js';
import Student from '../models/Student.js';


// @desc    Get student assignments
// @route   GET /api/students/assignments
// @access  Private/Student
const getStudentAssignments = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const { status, type } = req.query;
  let query = { student: student._id };

  if (status) query.status = status;
  if (type) query.type = type;

  const assignments = await Assignment.find(query)
    .populate('ulma', 'user')
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .sort({ dueDate: 1 });

  res.json({
    success: true,
    assignments,
    pendingCount: assignments.filter(a => a.status === 'pending').length,
    overdueCount: assignments.filter(a => 
      a.status === 'pending' && new Date(a.dueDate) < new Date()
    ).length
  });
});

// @desc    Submit assignment
// @route   PUT /api/students/assignments/:id/submit
// @access  Private/Student
const submitAssignment = asyncHandler(async (req, res) => {
  const { audioUrl, text, notes } = req.body;
  const student = await Student.findOne({ user: req.user.id });

  const assignment = await Assignment.findOne({
    _id: req.params.id,
    student: student._id
  });

  if (!assignment) {
    res.status(404);
    throw new Error('Assignment not found');
  }

  assignment.status = 'submitted';
  assignment.submission = {
    audioUrl,
    text,
    notes,
    submittedAt: new Date()
  };

  await assignment.save();

  res.json({
    success: true,
    assignment
  });
});

// @desc    Get assignment by ID
// @route   GET /api/students/assignments/:id
// @access  Private/Student
const getAssignmentById = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    student: student._id
  })
  .populate('ulma', 'user')
  .populate({
    path: 'ulma',
    populate: {
      path: 'user',
      select: 'name'
    }
  });

  if (!assignment) {
    res.status(404);
    throw new Error('Assignment not found');
  }

  res.json({
    success: true,
    assignment
  });
});

export {
  getStudentAssignments,
  submitAssignment,
  getAssignmentById
};