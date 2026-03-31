import asyncHandler from 'express-async-handler';
import Student from '../../models/Student.js';

// @desc    Update student progress
// @route   PUT /api/students/progress
// @access  Private/Student
export const updateProgress = asyncHandler(async (req, res) => {
  const { currentPara, currentSurah, ayatCompleted } = req.body;
  const student = await Student.findOne({ user: req.user.id });

  if (student) {
    student.progress.currentPara = currentPara || student.progress.currentPara;
    student.progress.currentSurah = currentSurah || student.progress.currentSurah;
    student.progress.ayatCompleted = ayatCompleted || student.progress.ayatCompleted;

    await student.save();
    res.json(student.progress);
  } else {
    res.status(404);
    throw new Error('Student not found');
  }
});

// @desc    Get student progress
// @route   GET /api/students/progress
// @access  Private/Student
export const getProgress = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id })
    .select('progress');

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  res.json({
    success: true,
    progress: {
      currentPara: student.progress.currentPara || 1,
      currentSurah: student.progress.currentSurah || 'Al-Fatiha',
      ayatCompleted: student.progress.ayatCompleted || 0,
      totalClasses: student.progress.totalClasses || 0,
      attendancePercentage: student.progress.attendancePercentage || 0,
      percentage: Math.round((student.progress.currentPara || 1) / 30 * 100)
    }
  });
});

// @desc    Add progress note
// @route   POST /api/students/progress/notes
// @access  Private/Student
export const addProgressNote = asyncHandler(async (req, res) => {
  const { note, type } = req.body;
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  student.progress.notes = student.progress.notes || [];
  student.progress.notes.push({
    date: new Date(),
    note,
    type: type || 'general'
  });

  await student.save();

  res.json({
    success: true,
    message: 'Note added successfully',
    notes: student.progress.notes
  });
});