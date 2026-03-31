import asyncHandler from 'express-async-handler';
import User from '../../models/User.js';
import Student from '../../models/Student.js';
import Ulma from '../../models/Ulma.js';
import Enrollment from '../../models/Enrollment.js';
import Payment from '../../models/Payment.js';

// @desc    Create admin user
// @route   POST /api/admin/create
// @access  Public (or Super Admin only)
export const createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone, country, timezone, languages } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const admin = await User.create({
      name,
      email,
      password,
      phone,
      country,
      timezone,
      languages,
      role: "admin",
      isVerified: true
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users with filters
// @route   GET /api/admin/users
// @access  Private/Admin
export const getUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, role, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  let query = {};

  if (role) {
    query.role = role;
  }

  if (status === 'active') {
    query.isActive = true;
  } else if (status === 'inactive') {
    query.isActive = false;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const users = await User.find(query)
    .select('-password')
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await User.countDocuments(query);

  // Get additional details for each user
  const usersWithDetails = await Promise.all(users.map(async (user) => {
    let details = { ...user._doc };

    if (user.role === 'student') {
      const student = await Student.findOne({ user: user._id });
      details.studentDetails = {
        currentCourse: student?.currentCourse,
        enrollmentDate: student?.enrollmentDate,
        subscription: student?.subscription,
      };
    } else if (user.role === 'ulma') {
      const ulma = await Ulma.findOne({ user: user._id });
      details.ulmaDetails = {
        isApproved: ulma?.isApproved,
        expertise: ulma?.expertise,
        experience: ulma?.experience,
        rating: ulma?.rating,
      };
    }

    return details;
  }));

  res.json({
    users: usersWithDetails,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get user details by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
export const getUserDetails = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  let details = { ...user._doc };

  if (user.role === 'student') {
    const student = await Student.findOne({ user: user._id })
      .populate('currentUlma', 'user')
      .populate({
        path: 'currentUlma',
        populate: {
          path: 'user',
          select: 'name email'
        }
      });

    const classes = await Class.find({ student: student?._id })
      .populate('ulma', 'user')
      .populate({
        path: 'ulma',
        populate: {
          path: 'user',
          select: 'name'
        }
      })
      .sort({ date: -1 })
      .limit(10);

    const payments = await Payment.find({ student: student?._id })
      .sort({ createdAt: -1 })
      .limit(10);

    details.studentDetails = {
      ...student?._doc,
      classes,
      payments,
    };
  } else if (user.role === 'ulma') {
    const ulma = await Ulma.findOne({ user: user._id })
      .populate('qualifications')
      .populate('certificates');

    const students = await Student.find({ currentUlma: ulma?._id })
      .populate('user', 'name email')
      .limit(10);

    const classes = await Class.find({ ulma: ulma?._id })
      .populate('student', 'user')
      .populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'name'
        }
      })
      .sort({ date: -1 })
      .limit(10);

    details.ulmaDetails = {
      ...ulma?._doc,
      students,
      classes,
    };
  }

  res.json(details);
});

// @desc    Toggle user active status
// @route   PUT /api/admin/users/:id/toggle-active
// @access  Private/Admin
export const toggleUserActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  user.isActive = !user.isActive;
  await user.save();

  res.json({
    success: true,
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Delete associated data based on role
  if (user.role === 'student') {
    await Student.deleteOne({ user: user._id });
    await Enrollment.deleteMany({ student: user._id });
    await Payment.deleteMany({ student: user._id });
  } else if (user.role === 'ulma') {
    await Ulma.deleteOne({ user: user._id });
    // Reassign students or handle accordingly
    await Student.updateMany(
      { currentUlma: user._id },
      { $set: { currentUlma: null, currentCourse: null } }
    );
  }

  await User.deleteOne({ _id: user._id });

  res.json({
    success: true,
    message: 'User deleted successfully',
  });
});