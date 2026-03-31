import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import User from '../../models/User.js';
import Student from '../../models/Student.js';
import { sendEmail } from '../../config/email.js';

// @desc    Get all ulma with filters
// @route   GET /api/admin/ulma
// @access  Private/Admin
export const getAllUlma = asyncHandler(async (req, res) => {
  const { status, expertise, country, page = 1, limit = 10 } = req.query;

  let query = {};

  if (status === 'approved') {
    query.isApproved = true;
  } else if (status === 'pending') {
    query.isApproved = false;
  }

  if (expertise) {
    query.expertise = { $in: [expertise] };
  }

  const ulma = await Ulma.find(query)
    .populate('user', 'name email phone country timezone languages')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  // Filter by country if provided
  let filteredUlma = ulma;
  if (country) {
    filteredUlma = ulma.filter(u => u.user?.country?.toLowerCase() === country.toLowerCase());
  }

  const total = await Ulma.countDocuments(query);

  res.json({
    ulma: filteredUlma,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get pending ulma approvals
// @route   GET /api/admin/ulma/pending
// @access  Private/Admin
export const getUlmaApprovals = asyncHandler(async (req, res) => {
  const ulma = await Ulma.find({ isApproved: false })
    .populate('user', 'name email phone country timezone languages')
    .sort({ createdAt: -1 });

  res.json(ulma);
});

// @desc    Approve ulma
// @route   PUT /api/admin/ulma/:id/approve
// @access  Private/Admin
export const approveUlma = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findById(req.params.id).populate('user', 'name email');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  ulma.isApproved = true;
  await ulma.save();

  // Update user verification status
  await User.findByIdAndUpdate(ulma.user._id, { isVerified: true });

  // Send approval email
  if (ulma.user?.email) {
    try {
      await sendEmail(
        ulma.user.email,
        'Account Approved - Quran Academy',
        `<p>Assalamualaikum ${ulma.user.name},</p>
        <p>Your account as a teacher (ulma) has been <b>approved</b> by admin!<br>
        You can now login and start teaching your students.</p>
        <p>JazakAllah Khair,<br>Quran Academy Team</p>`
      );
    } catch (e) {
      console.error('Failed to send ulma approval email:', e);
    }
  }

  res.json({
    success: true,
    message: 'Ulma approved successfully',
    ulma,
  });
});

// @desc    Reject ulma
// @route   PUT /api/admin/ulma/:id/reject
// @access  Private/Admin
export const rejectUlma = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const ulma = await Ulma.findById(req.params.id).populate('user', 'name email');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  // Send rejection email
  if (ulma.user?.email) {
    try {
      await sendEmail(
        ulma.user.email,
        'Account Rejected - Quran Academy',
        `<p>Assalamualaikum ${ulma.user.name},</p>
        <p>We are sorry to inform you that your account as a teacher (ulma) has been <b>rejected</b> by admin.</p>
        ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}
        <p>If you have any questions, please contact support.</p>
        <p>JazakAllah Khair,<br>Quran Academy Team</p>`
      );
    } catch (e) {
      console.error('Failed to send ulma rejection email:', e);
    }
  }

  await Ulma.deleteOne({ _id: ulma._id });

  res.json({
    success: true,
    message: 'Ulma rejected successfully',
  });
});

// @desc    Get ulma details with students and classes
// @route   GET /api/admin/ulma/:id
// @access  Private/Admin
export const getUlmaDetails = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findById(req.params.id)
    .populate('user', 'name email phone country')
    .populate('qualifications')
    .populate('certificates');

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  const students = await Student.find({ currentUlma: ulma._id })
    .populate('user', 'name email')
    .limit(20);

  const classes = await Class.find({ ulma: ulma._id })
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .sort({ date: -1 })
    .limit(20);

  res.json({
    ...ulma._doc,
    students,
    classes
  });
});