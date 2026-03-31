import asyncHandler from 'express-async-handler';
import Fee from '../../models/Fee.js';
import Student from '../../models/Student.js';
import User from '../../models/User.js';
import { io } from '../../socket/socketServer.js';

// @desc    Get student's pending fees
// @route   GET /api/students/fees/pending
// @access  Private/Student
export const getPendingFees = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student profile not found');
  }

  const pendingFees = await Fee.find({
    student: student._id,
    status: { $in: ['pending', 'overdue'] }
  })
  .populate({
    path: 'enrollment',
    populate: {
      path: 'course',
      select: 'name'
    }
  })
  .sort({ dueDate: 1 });

  res.json(pendingFees);
});

// @desc    Get student's payment history
// @route   GET /api/students/fees/history
// @access  Private/Student
export const getPaymentHistory = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student profile not found');
  }

  const paymentHistory = await Fee.find({
    student: student._id,
    status: 'paid'
  })
  .populate({
    path: 'enrollment',
    populate: {
      path: 'course',
      select: 'name'
    }
  })
  .sort({ createdAt: -1 })
  .limit(50);

  res.json(paymentHistory);
});

// @desc    Process payment for a fee
// @route   POST /api/students/fees/pay
// @access  Private/Student
export const processPayment = asyncHandler(async (req, res) => {
  const { feeId, paymentMethod, transactionId } = req.body;

  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student profile not found');
  }

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

  await fee.save();

  // Update student's subscription if this was the first payment
  if (fee.enrollment) {
    await Student.findByIdAndUpdate(student._id, {
      'subscription.isActive': true,
      $push: {
        'subscription.paymentHistory': {
          date: new Date(),
          amount: fee.amount,
          status: 'paid',
          transactionId: transactionId
        }
      }
    });
  }

  res.json({
    success: true,
    message: 'Payment processed successfully',
    receipt: {
      invoiceNumber: fee.invoiceNumber,
      amount: fee.amount,
      paymentDate: fee.paymentDate,
      paymentMethod: fee.paymentMethod
    }
  });

  // Emit real-time update for admin
  if (io) {
    io.emit('feePaid', {
      feeId: fee._id,
      studentId: student._id,
      amount: fee.amount,
      invoiceNumber: fee.invoiceNumber
    });
  }
});

// @desc    Download invoice
// @route   GET /api/students/fees/:id/invoice
// @access  Private/Student
export const downloadInvoice = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });

  if (!student) {
    res.status(404);
    throw new Error('Student profile not found');
  }

  const fee = await Fee.findOne({
    _id: req.params.id,
    student: student._id
  });

  if (!fee) {
    res.status(404);
    throw new Error('Fee not found');
  }

  // For now, return JSON. In production, generate PDF
  res.json({
    invoiceNumber: fee.invoiceNumber,
    student: req.user.name,
    amount: fee.amount,
    dueDate: fee.dueDate,
    paymentDeadline: fee.paymentDeadline,
    status: fee.status,
    description: fee.description
  });
});