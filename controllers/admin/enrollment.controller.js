import asyncHandler from 'express-async-handler';
import Enrollment from '../../models/Enrollment.js';
import Student from '../../models/Student.js';
import Ulma from '../../models/Ulma.js';
import User from '../../models/User.js';
import Fee from '../../models/Fee.js';
import Class from '../../models/Class.js';
import Notification from '../../models/Notification.js';
import Conversation from '../../models/Conversation.js';
import { io } from '../../socket/socketServer.js';
import { sendEmail } from '../../config/email.js';
import { normalizeScheduleToUTC } from '../../utils/scheduleTimezone.js';

// @desc    Get all enrollments
// @route   GET /api/admin/enrollments
// @access  Private/Admin
export const getAllEnrollments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      course,
      startDate,
      endDate,
    } = req.query;

    const query = {};

    if (status) {
      if (status === 'approve') query.status = 'approved';
      else if (status === 'reject') query.status = 'rejected';
      else query.status = status;
    }

    if (course) query.course = course;

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const enrollments = await Enrollment.find(query)
      .populate({
        path: 'student',
        populate: {
          path: 'user'
        }
      })
      .populate('course', 'name description duration')
      .populate({
        path: 'ulma',
        populate: {
          path: 'user'
        }
      })
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Enrollment.countDocuments(query);

    res.json({
      enrollments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch enrollments" });
  }
};

// @desc    Get single enrollment
// @route   GET /api/admin/enrollments/:id
// @access  Private/Admin
export const getEnrollmentById = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email phone'
      }
    })
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email phone'
      }
    })
    .populate('course', 'name description duration')
    .populate('processedBy', 'name email');

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  res.json(enrollment);
});

// @desc    Approve enrollment with auto fee generation
// @route   PUT /api/admin/enrollments/:id/approve
// @access  Private/Admin
export const approveEnrollment = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Enrollment find karein with population
    const enrollment = await Enrollment.findById(id)
      .populate('student')
      .populate('ulma')
      .populate('course', 'name')
      .populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'name email'
        }
      });

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (!enrollment.student) {
      return res.status(400).json({ message: "Enrollment student not found" });
    }

    if (!enrollment.ulma) {
      return res.status(400).json({ message: "Enrollment ulma not found" });
    }

    // Update enrollment status
    enrollment.status = 'approved';
    enrollment.processedAt = new Date();
    enrollment.processedBy = req.user.id;
    enrollment.startDate = new Date();
    if (notes) enrollment.notes = notes;

    await enrollment.save();

    // AUTOMATIC FEE GENERATION (5 days deadline)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // Due tomorrow

    const paymentDeadline = new Date(dueDate);
    paymentDeadline.setDate(paymentDeadline.getDate() + 5); // 5 days after due date

    const fee = await Fee.create({
      student: enrollment.student._id,
      enrollment: enrollment._id,
      ulma: enrollment.ulma._id,
      amount: enrollment.monthlyFee,
      monthlyFee: enrollment.monthlyFee,
      dueDate: dueDate,
      paymentDeadline: paymentDeadline,
      description: `First month fee for ${enrollment.course.name} course`,
      notes: `Payment due within 5 days.`,
      createdBy: req.user.id
    });

    // Update student's subscription info
    await Student.findByIdAndUpdate(enrollment.student._id, {
      $set: {
        'subscription.isActive': true,
        'subscription.currentPlan': enrollment.course,
        'subscription.monthlyFee': enrollment.monthlyFee,
        'subscription.nextBillingDate': dueDate,
        currentCourse: enrollment.course,
        currentUlma: enrollment.ulma._id
      },
      $push: {
        'subscription.paymentHistory': {
          date: new Date(),
          amount: enrollment.monthlyFee,
          status: 'pending',
          invoiceNumber: fee.invoiceNumber
        }
      }
    });

    // Create conversation for chat
    const ulmaUser = await User.findById(enrollment.ulma.user);
    const studentUser = await User.findById(enrollment.student.user);

    let conversation = await Conversation.findOne({
      studentId: studentUser._id,
      ulmaId: ulmaUser._id,
      courseId: enrollment.course
    });

    if (!conversation) {
      conversation = await Conversation.create({
        studentId: studentUser._id,
        ulmaId: ulmaUser._id,
        courseId: enrollment.course,
        lastMessage: '',
        lastUpdated: new Date()
      });
    }


    // Create notification for Ulma
    await Notification.create({
      user: ulmaUser._id,
      title: 'New Student Enrollment Approved',
      message: `${enrollment.student?.user?.name || 'A student'} has been enrolled in your ${enrollment.course.name} course.`,
      type: 'system',
      link: `/ulma/students/${enrollment.student._id}`,
      metadata: {
        enrollmentId: enrollment._id,
        studentId: enrollment.student._id,
        course: enrollment.course
      }
    });

    // Create notification for Student
    await Notification.create({
      user: studentUser._id,
      title: 'Enrollment Approved',
      message: `Your enrollment in ${enrollment.course.name} course with ${enrollment.ulma?.user?.name || 'Ulma'} has been approved.`,
      type: 'system',
      link: `/student/courses`,
      metadata: {
        enrollmentId: enrollment._id,
        ulmaId: enrollment.ulma._id,
        course: enrollment.course
      }
    });

    // Send email to student
    if (studentUser?.email) {
      try {
        await sendEmail(
          studentUser.email,
          'Enrollment Approved - Quran Academy',
          `<p>Assalamualaikum ${studentUser.name},</p>
          <p>Your enrollment in <b>${enrollment.course.name}</b> course with <b>${enrollment.ulma?.user?.name || 'Ulma'}</b> has been <b>approved</b>!<br>
          You can now access your classes and dashboard.</p>
          <p>JazakAllah Khair,<br>Quran Academy Team</p>`
        );
      } catch (e) {
        console.error('Failed to send student approval email:', e);
      }
    }

    // Send email to ulma/teacher
    if (ulmaUser?.email) {
      try {
        await sendEmail(
          ulmaUser.email,
          'New Student Enrollment Approved - Quran Academy',
          `<p>Assalamualaikum ${ulmaUser.name},</p>
          <p>A new student <b>${studentUser.name}</b> has been enrolled in your <b>${enrollment.course.name}</b> course.<br>
          Please check your dashboard for details.</p>
          <p>JazakAllah Khair,<br>Quran Academy Team</p>`
        );
      } catch (e) {
        console.error('Failed to send ulma approval email:', e);
      }
    }

    // Create first month classes based on schedule
    const classes = [];
    const scheduleDays = enrollment.schedule.days;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2); // Classes start in 2 days

    // Day mapping for consistency
    const dayMap = {
      'monday': 'mon',
      'tuesday': 'tue', 
      'wednesday': 'wed',
      'thursday': 'thu',
      'friday': 'fri',
      'saturday': 'sat',
      'sunday': 'sun'
    };

    // Create classes for next 30 days
    for (let i = 0; i < 30; i++) {
      const classDate = new Date(startDate);
      classDate.setDate(classDate.getDate() + i);
      const dayName = classDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const shortDay = dayMap[dayName];

      if (scheduleDays.includes(shortDay)) {
        // Calculate UTC start and end times for this specific date
        let utcStart, utcEnd;
        if (enrollment.schedule.utcStart && enrollment.schedule.utcEnd) {
          // Use UTC dates from enrollment
          utcStart = new Date(enrollment.schedule.utcStart);
          utcEnd = new Date(enrollment.schedule.utcEnd);
          // Set the date part to match the class date, keep the time part
          utcStart.setFullYear(classDate.getFullYear(), classDate.getMonth(), classDate.getDate());
          utcEnd.setFullYear(classDate.getFullYear(), classDate.getMonth(), classDate.getDate());
        } else {
          // Fallback for old format
          utcStart = new Date(`${classDate.toISOString().split('T')[0]}T${enrollment.schedule.startTime}:00Z`);
          utcEnd = new Date(`${classDate.toISOString().split('T')[0]}T${enrollment.schedule.endTime}:00Z`);
        }

        const newClass = await Class.create({
          student: enrollment.student._id,
          ulma: enrollment.ulma._id,
          enrollment: enrollment._id,
          course: enrollment.course,
          date: classDate,
          utcStart: utcStart,
          utcEnd: utcEnd,
          status: 'scheduled',
          topic: `Class ${classes.length + 1}`
        });
        classes.push(newClass);
      }
    }

    res.json({
      success: true,
      message: "Enrollment approved successfully. Fee generated with 5-day payment deadline.",
      enrollment: {
        _id: enrollment._id,
        student: enrollment.student?.user?.name,
        ulma: enrollment.ulma?.user?.name,
        course: enrollment.course,
        monthlyFee: enrollment.monthlyFee,
        status: enrollment.status
      },
      fee: {
        invoiceNumber: fee.invoiceNumber,
        amount: fee.amount,
        dueDate: fee.dueDate,
        status: fee.status
      },
      classesCreated: classes.length,
      firstClassDate: classes[0]?.date
    });

    // Update Ulma's lectureSlots to mark as booked
    const reverseDayMap = {
      'mon': 'monday',
      'tue': 'tuesday',
      'wed': 'wednesday',
      'thu': 'thursday',
      'fri': 'friday',
      'sat': 'saturday'
    };

    await Ulma.findByIdAndUpdate(enrollment.ulma._id, {
      $push: {
        lectureSlots: {
          $each: enrollment.schedule.days.map(day => ({
            day: reverseDayMap[day],
            startTime: enrollment.schedule.startTime,
            endTime: enrollment.schedule.endTime,
            enrollmentId: enrollment._id
          }))
        }
      }
    });

    // Emit real-time update to student
    if (io && studentUser) {
      io.to(studentUser._id.toString()).emit('enrollmentApproved', {
        enrollment: enrollment._id,
        fee: fee._id,
        message: 'Your enrollment has been approved and fee generated'
      });
    }

    // Emit to admin for real-time dashboard update
    if (io) {
      io.emit('feeCreated', {
        feeId: fee._id,
        studentId: enrollment.student._id,
        amount: fee.amount,
        invoiceNumber: fee.invoiceNumber
      });
    }

  } catch (error) {
    console.error('Error approving enrollment:', error);
    res.status(500).json({
      message: "Enrollment approval failed",
      error: error.message
    });
  }
});

// @desc    Update enrollment status (approve/reject)
// @route   PUT /api/admin/enrollments/:id/status
// @access  Private/Admin
export const updateEnrollmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Status ko validate karein
    const validStatuses = ['pending', 'approved', 'rejected'];

    // Agar frontend se 'approve' ya 'reject' aaye toh convert karein
    let finalStatus = status;
    if (status === 'approve') {
      finalStatus = 'approved';
    } else if (status === 'reject') {
      finalStatus = 'rejected';
    }

    // Validate karein ke finalStatus valid hai
    if (!validStatuses.includes(finalStatus)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const enrollment = await Enrollment.findById(id);
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    enrollment.status = finalStatus;
    if (notes) enrollment.notes = notes;

    // Agar approve ho raha hai toh processedAt aur processedBy bhi set karein
    if (finalStatus === 'approved' || finalStatus === 'rejected') {
      enrollment.processedAt = new Date();
      enrollment.processedBy = req.user.id;
    }

    await enrollment.save();

    res.json({
      message: `Enrollment ${finalStatus} successfully`,
      enrollment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Status update failed" });
  }
};

// @desc    Delete enrollment
// @route   DELETE /api/admin/enrollments/:id
// @access  Private/Admin
export const deleteEnrollment = async (req, res) => {
  try {
    const { id } = req.params;

    const enrollment = await Enrollment.findByIdAndDelete(id);
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    res.json({ message: "Enrollment deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Delete failed" });
  }
};

// @desc    Create new enrollment (Admin only)
// @route   POST /api/admin/enrollments
// @access  Private/Admin
export const createEnrollment = asyncHandler(async (req, res) => {
  const { studentId, ulmaId, course, schedule, monthlyFee } = req.body;

  if (!studentId || !ulmaId || !course || !schedule) {
    return res.status(400).json({
      message: 'Missing required fields: studentId, ulmaId, course, schedule'
    });
  }

  if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
    return res.status(400).json({
      message: 'Schedule days are required'
    });
  }

  if (!schedule.startTime || !schedule.endTime) {
    return res.status(400).json({
      message: 'Schedule startTime and endTime are required'
    });
  }

  const normalizedSchedule = normalizeScheduleToUTC(schedule);

  // Find the student document by user ID
  const studentDoc = await Student.findOne({ user: studentId });
  if (!studentDoc) {
    return res.status(404).json({
      message: 'Student not found'
    });
  }

  // Check if student already enrolled in this course
  const existingEnrollment = await Enrollment.findOne({
    student: studentDoc._id,
    course,
    status: { $nin: ['cancelled', 'rejected', 'completed'] }
  });

  if (existingEnrollment) {
    return res.status(400).json({
      message: 'Student is already enrolled in this course'
    });
  }

  const enrollment = await Enrollment.create({
    student: studentDoc._id,
    ulma: ulmaId,
    course,
    schedule: normalizedSchedule,
    monthlyFee: monthlyFee || 50,
    status: 'approved', // Admin created enrollments are auto-approved
    processedAt: new Date(),
    processedBy: req.user.id,
    billing: {
      currentMonth: new Date().toISOString().slice(0, 7),
      feeStatus: 'pending'
    }
  });

  // Populate the response
  const populatedEnrollment = await Enrollment.findById(enrollment._id)
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name email phone'
      }
    })
    .populate('course', 'name description')
    .populate({
      path: 'ulma',
      populate: {
        path: 'user',
        select: 'name email'
      }
    });

  res.status(201).json({
    success: true,
    message: 'Enrollment created successfully',
    enrollment: populatedEnrollment
  });
});

// @desc    Get enrollment statistics
// @route   GET /api/admin/enrollments/stats/summary
// @access  Private/Admin
export const getEnrollmentStats = asyncHandler(async (req, res) => {
  const stats = await Enrollment.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalFee: { $sum: '$monthlyFee' }
      }
    }
  ]);

  const courseDistribution = await Enrollment.aggregate([
    {
      $group: {
        _id: '$course',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  res.json({
    statusStats: stats,
    courseDistribution
  });
});