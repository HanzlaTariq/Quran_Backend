import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import Class from '../../models/Class.js';

// @desc    Get availability
// @route   GET /api/ulma/availability
// @access  Private/Ulma
export const getAvailability = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id })
    .select('availability workingHours');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  // Get booked slots for next 7 days
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  const bookedClasses = await Class.find({
    ulma: ulma._id,
    date: { $gte: startDate, $lte: endDate },
    status: { $in: ['scheduled', 'ongoing'] },
  }).select('date startTime endTime');

  res.json({
    availability: ulma.availability || [],
    workingHours: ulma.workingHours || { startTime: '09:00', endTime: '17:00' },
    bookedSlots: bookedClasses,
  });
});

// @desc    Update availability
// @route   PUT /api/ulma/availability
// @access  Private/Ulma
export const updateAvailability = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  const { availability, workingHours } = req.body;

  // Validate availability slots
  if (availability) {
    const isValid = availability.every(slot =>
      slot.day && slot.startTime && slot.endTime
    );

    if (!isValid) {
      res.status(400);
      throw new Error('Invalid availability format');
    }
  }

  ulma.availability = availability || ulma.availability;
  ulma.workingHours = workingHours || ulma.workingHours;

  await ulma.save();

  res.json({
    success: true,
    message: 'Availability updated successfully',
    availability: ulma.availability,
    workingHours: ulma.workingHours,
  });
});