import asyncHandler from 'express-async-handler';
import Course from '../../models/Course.js';
import Student from '../../models/Student.js';

// @desc    Get all courses
// @route   GET /api/admin/courses
// @access  Private/Admin
export const getAllCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find()
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });

  res.json(courses);
});

// @desc    Create new course
// @route   POST /api/admin/courses
// @access  Private/Admin
export const createCourse = asyncHandler(async (req, res) => {
  const { name, description, duration, monthlyFee, curriculum, requirements } = req.body;

  const courseExists = await Course.findOne({ name });
  if (courseExists) {
    res.status(400);
    throw new Error('Course already exists');
  }

  const course = await Course.create({
    name,
    description,
    duration: parseInt(duration),
    monthlyFee: parseFloat(monthlyFee),
    curriculum: curriculum || [],
    requirements: requirements || [],
    createdBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: 'Course created successfully',
    course,
  });
});

// @desc    Update course
// @route   PUT /api/admin/courses/:id
// @access  Private/Admin
export const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  course.name = req.body.name || course.name;
  course.description = req.body.description || course.description;
  course.duration = req.body.duration ? parseInt(req.body.duration) : course.duration;
  course.monthlyFee = req.body.monthlyFee ? parseFloat(req.body.monthlyFee) : course.monthlyFee;
  course.curriculum = req.body.curriculum || course.curriculum;
  course.requirements = req.body.requirements || course.requirements;
  course.isActive = req.body.isActive !== undefined ? req.body.isActive : course.isActive;

  const updatedCourse = await course.save();

  res.json({
    success: true,
    message: 'Course updated successfully',
    course: updatedCourse,
  });
});

// @desc    Delete course
// @route   DELETE /api/admin/courses/:id
// @access  Private/Admin
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Check if any students are enrolled in this course
  const enrolledStudents = await Student.countDocuments({ currentCourse: course._id });
  if (enrolledStudents > 0) {
    res.status(400);
    throw new Error(`Cannot delete course. ${enrolledStudents} students are currently enrolled.`);
  }

  await Course.deleteOne({ _id: course._id });

  res.json({
    success: true,
    message: 'Course deleted successfully',
  });
});

// @desc    Get single course
// @route   GET /api/admin/courses/:id
// @access  Private/Admin
export const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .populate('createdBy', 'name email');

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  res.json(course);
});