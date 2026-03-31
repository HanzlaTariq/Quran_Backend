import asyncHandler from 'express-async-handler';
import Course from '../../models/Course.js';

// @desc    Get all active courses
// @route   GET /api/students/courses
// @access  Private/Student
export const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true });
    res.status(200).json({
      success: true,
      courses,   // important: ye frontend me coursesRes.data.courses ko match kare
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses' });
  }
};

// @desc    Get course by ID
// @route   GET /api/students/courses/:id
// @access  Private/Student
export const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }
  
  res.json({
    success: true,
    course
  });
});