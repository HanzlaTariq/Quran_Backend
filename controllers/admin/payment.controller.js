import asyncHandler from 'express-async-handler';
import Payment from '../../models/Payment.js';
import Fee from '../../models/Fee.js';

// @desc    Get all payments
// @route   GET /api/admin/payments
// @access  Private/Admin
export const getPayments = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

  let query = {};

  if (status) {
    query.status = status;
  }

  if (startDate && endDate) {
    query.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const payments = await Payment.find(query)
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate('processedBy', 'name')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Payment.countDocuments(query);

  // Calculate summary
  const summary = await Payment.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        completedAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0]
          }
        },
        pendingAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
          }
        },
        failedAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'failed'] }, '$amount', 0]
          }
        },
        totalCount: { $sum: 1 },
        completedCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        },
      },
    },
  ]);

  res.json({
    payments,
    summary: summary[0] || {
      totalAmount: 0,
      completedAmount: 0,
      pendingAmount: 0,
      failedAmount: 0,
      totalCount: 0,
      completedCount: 0,
    },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get payment summary
// @route   GET /api/admin/payments/summary
// @access  Private/Admin
export const getPaymentSummary = asyncHandler(async (req, res) => {
  const { period = 'monthly' } = req.query;

  let groupFormat, matchDate;
  const now = new Date();

  switch (period) {
    case 'daily':
      groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
      matchDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case 'weekly':
      groupFormat = { $week: '$createdAt' };
      matchDate = new Date(now.setMonth(now.getMonth() - 6));
      break;
    case 'monthly':
    default:
      groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
      matchDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
  }

  const paymentTrends = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: matchDate },
      },
    },
    {
      $group: {
        _id: groupFormat,
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const paymentMethods = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: matchDate },
      },
    },
    {
      $group: {
        _id: '$method',
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  res.json({
    paymentTrends,
    paymentMethods,
    period,
  });
});

// @desc    Get all fees
// @route   GET /api/admin/fees
// @access  Private/Admin
export const getAllFees = asyncHandler(async (req, res) => {
  const { status, studentId, page = 1, limit = 10 } = req.query;

  let query = {};
  if (status) query.status = status;
  if (studentId) query.student = studentId;

  const fees = await Fee.find(query)
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate('enrollment')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Fee.countDocuments(query);

  res.json({
    fees,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single fee
// @route   GET /api/admin/fees/:id
// @access  Private/Admin
export const getFeeById = asyncHandler(async (req, res) => {
  const fee = await Fee.findById(req.params.id)
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate('enrollment')
    .populate('ulma')
    .populate('createdBy', 'name email');

  if (!fee) {
    res.status(404);
    throw new Error('Fee not found');
  }

  res.json(fee);
});