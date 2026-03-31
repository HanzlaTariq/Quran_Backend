import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';

// @desc    Get available Ulma for student
// @route   GET /api/students/ulma/available
// @access  Private/Student
export const getAvailableUlma = asyncHandler(async (req, res) => {
  const { course, language, timezone } = req.query;

  let query = { isApproved: true };

  if (course) {
    query.expertise = { $in: [course] };
  }

  const ulmaList = await Ulma.find(query)
    .populate('user', 'name email country timezone languages')
    .select('-__v');

  // Filter by language if provided
  let filteredUlma = ulmaList;
  if (language) {
    filteredUlma = ulmaList.filter(ulma =>
      ulma.user.languages?.includes(language)
    );
  }

  // Filter by timezone if provided
  if (timezone) {
    filteredUlma = filteredUlma.filter(ulma =>
      ulma.user.timezone === timezone
    );
  }

  // Filter availability to exclude booked slots
  filteredUlma = filteredUlma.map(ulma => {
    const availableSlots = ulma.availability.filter(slot => {
      return slot.isActive && !ulma.lectureSlots.some(booked => 
        booked.day === slot.day && booked.startTime === slot.startTime && booked.endTime === slot.endTime
      );
    });
    return {
      ...ulma.toObject(),
      availableSlots
    };
  });

  res.json(filteredUlma);
});

// @desc    Get Ulma details by ID
// @route   GET /api/students/ulma/:id
// @access  Private/Student
export const getUlmaDetails = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findById(req.params.id)
    .populate('user', 'name email country timezone languages profileImage')
    .populate('qualifications');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  res.json({
    success: true,
    ulma
  });
});