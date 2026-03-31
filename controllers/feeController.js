import asyncHandler from 'express-async-handler';
import Fee from '../models/Fee.js';
import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';

// @desc    Get pending fees for student
// @route   GET /api/students/fees/pending
// @access  Private/Student
export const getPendingFees = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const fees = await Fee.find({ 
    student: student._id,
    status: { $in: ['pending', 'overdue'] }
  })
  .populate('enrollment', 'course schedule')
  .populate('ulma', 'user')
  .populate({
    path: 'ulma',
    populate: {
      path: 'user',
      select: 'name'
    }
  })
  .sort({ dueDate: 1 });

  res.json(fees);
});

// @desc    Process payment
// @route   POST /api/students/fees/pay
// @access  Private/Student
export const payFee = asyncHandler(async (req, res) => {
  const { feeId, paymentMethod, transactionId, receiptUrl } = req.body;
  
  // Find student
  const student = await Student.findOne({ user: req.user.id });
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Find fee
  const fee = await Fee.findOne({
    _id: feeId,
    student: student._id
  });

  if (!fee) {
    res.status(404);
    throw new Error('Fee not found');
  }

  if (fee.status === 'paid') {
    res.status(400);
    throw new Error('Fee already paid');
  }

  // Update fee status
  fee.status = 'paid';
  fee.paymentDate = new Date();
  fee.paymentMethod = paymentMethod;
  fee.transactionId = transactionId;
  if (receiptUrl) fee.receiptUrl = receiptUrl;

  await fee.save();

  // Update student subscription
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  await Student.findByIdAndUpdate(student._id, {
    $set: {
      'subscription.lastPaymentDate': new Date(),
      'subscription.nextBillingDate': nextBillingDate,
      'subscription.paymentMethod': paymentMethod
    },
    $push: {
      'subscription.paymentHistory': {
        date: new Date(),
        amount: fee.amount,
        status: 'paid',
        transactionId: transactionId,
        invoiceNumber: fee.invoiceNumber
      }
    }
  });

  // Generate next month fee (auto-recurring)
  const nextDueDate = new Date();
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);

  const nextFee = await Fee.create({
    student: student._id,
    enrollment: fee.enrollment,
    ulma: fee.ulma,
    amount: fee.monthlyFee,
    monthlyFee: fee.monthlyFee,
    dueDate: nextDueDate,
    description: `Monthly fee for ${new Date().toLocaleString('default', { month: 'long' })}`,
    status: 'pending',
    createdBy: req.user.id
  });

  res.json({
    success: true,
    message: 'Payment processed successfully',
    receipt: {
      invoiceNumber: fee.invoiceNumber,
      amount: fee.amount,
      paymentDate: fee.paymentDate,
      transactionId: fee.transactionId
    },
    nextFee: {
      invoiceNumber: nextFee.invoiceNumber,
      amount: nextFee.amount,
      dueDate: nextFee.dueDate
    }
  });
});

// @desc    Get payment history
// @route   GET /api/students/fees/history
// @access  Private/Student
export const getPaymentHistory = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  
  const fees = await Fee.find({ 
    student: student._id,
    status: 'paid'
  })
  .populate('enrollment', 'course')
  .sort({ paymentDate: -1 })
  .limit(50);

  res.json(fees);
});

// @desc    Get fee by ID
// @route   GET /api/students/fees/:id
// @access  Private/Student
export const getFeeById = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  
  const fee = await Fee.findOne({
    _id: req.params.id,
    student: student._id
  })
  .populate('enrollment', 'course schedule')
  .populate('ulma', 'user')
  .populate({
    path: 'ulma',
    populate: {
      path: 'user',
      select: 'name email'
    }
  });

  if (!fee) {
    res.status(404);
    throw new Error('Fee not found');
  }

  res.json(fee);
});

// @desc    Get all fees (Admin)
// @route   GET /api/admin/fees
// @access  Private/Admin
export const getAllFees = asyncHandler(async (req, res) => {
  const { status, studentId, page = 1, limit = 10 } = req.query;

  let query = {};

  if (status) {
    query.status = status;
  }

  if (studentId) {
    query.student = studentId;
  }

  const fees = await Fee.find(query)
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate('enrollment', 'course')
    .populate('ulma', 'user')
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .sort({ dueDate: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Fee.countDocuments(query);

  // Calculate summary
  const summary = await Fee.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        pendingAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
        },
        paidAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] }
        },
        overdueAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$amount', 0] }
        },
        totalCount: { $sum: 1 },
      },
    },
  ]);

  res.json({
    fees,
    summary: summary[0] || {
      totalAmount: 0,
      pendingAmount: 0,
      paidAmount: 0,
      overdueAmount: 0,
      totalCount: 0,
    },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Generate monthly fees for all active enrollments (Admin)
// @route   POST /api/admin/fees/generate-monthly
// @access  Private/Admin
export const generateMonthlyFees = asyncHandler(async (req, res) => {
  // Find all active enrollments
  const enrollments = await Enrollment.find({ 
    status: { $in: ['approved', 'active'] }
  }).populate('student');

  const generatedFees = [];
  const today = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);

  for (const enrollment of enrollments) {
    // Check if fee already exists for this month
    const existingFee = await Fee.findOne({
      enrollment: enrollment._id,
      dueDate: {
        $gte: new Date(today.getFullYear(), today.getMonth(), 1),
        $lt: new Date(today.getFullYear(), today.getMonth() + 1, 1)
      }
    });

    if (!existingFee) {
      const fee = await Fee.create({
        student: enrollment.student._id,
        enrollment: enrollment._id,
        ulma: enrollment.ulma,
        amount: enrollment.monthlyFee,
        monthlyFee: enrollment.monthlyFee,
        dueDate: dueDate,
        description: `Monthly fee for ${today.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
        notes: `Auto-generated monthly fee`,
        createdBy: req.user.id
      });

      generatedFees.push({
        student: enrollment.student._id,
        invoiceNumber: fee.invoiceNumber,
        amount: fee.amount,
        dueDate: fee.dueDate
      });
    }
  }

  res.json({
    success: true,
    message: `Generated ${generatedFees.length} monthly fees`,
    generatedFees
  });
});