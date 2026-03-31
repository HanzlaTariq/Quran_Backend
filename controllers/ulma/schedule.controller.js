import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import Class from '../../models/Class.js';

// @desc    Get ulma schedule/timetable
// @route   GET /api/ulma/schedule
// @access  Private/Ulma
export const getUlmaSchedule = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id }).populate({
    path: 'user',
    select: 'timezone'
  });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  const ulmaTimezone = ulma.user?.timezone || 'UTC';
  const { date, status, studentId, page = 1, limit = 20 } = req.query;

  let query = { ulma: ulma._id };

  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    query.date = { $gte: startDate, $lte: endDate };
  }

  if (status) {
    query.status = status;
  }

  if (studentId) {
    query.student = studentId;
  }

  const classes = await Class.find(query)
    .populate({
      path: 'student',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name email profileImage'
      }
    })
    .populate('course', 'name')
    .populate('attendance', 'status markedAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ date: 1, startTime: 1 });

  const total = await Class.countDocuments(query);

  // Format for DataGrid
  const formattedClasses = classes.map(cls => {
    let startTime = cls.startTime;
    let endTime = cls.endTime;

    // If local start/end are missing, derive from UTC and ulma timezone
    if ((!startTime || !endTime) && cls.utcStart && cls.utcEnd) {
      const utcStart = new Date(cls.utcStart);
      const utcEnd = new Date(cls.utcEnd);

      startTime = utcStart.toLocaleTimeString('en-US', {
        timeZone: ulmaTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      endTime = utcEnd.toLocaleTimeString('en-US', {
        timeZone: ulmaTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    // Guarantee fallback for empty values
    if (!startTime) startTime = 'N/A';
    if (!endTime) endTime = 'N/A';

    return {
      id: cls._id,
      studentName: cls.student?.user?.name || 'Unknown',
      course: cls.course?.name || (typeof cls.course === 'string' ? cls.course : 'General'),
      topic: cls.topic || 'No topic',
      date: cls.date,
      startTime,
      endTime,
      time: `${startTime} - ${endTime}`,
      status: cls.status,
      notes: cls.notes || '',
      meetingLink: cls.meetingLink || '',
      attendance: cls.attendance || null,
    };
  });

  res.json({
    classes: formattedClasses,
    total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get timetable/calendar events
// @route   GET /api/ulma/timetable/events
// @access  Private/Ulma
export const getTimetableEvents = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma not found');
  }

  const { start, end } = req.query;

  let query = { ulma: ulma._id };

  if (start && end) {
    query.date = { $gte: new Date(start), $lte: new Date(end) };
  } else {
    // Default to current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    query.date = { $gte: firstDay, $lte: lastDay };
  }

  const classes = await Class.find(query)
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name'
      }
    })
    .sort({ date: 1, startTime: 1 });

  const events = classes.map(cls => ({
    id: cls._id,
    title: `${cls.student?.user?.name || 'Student'}: ${cls.course?.name || cls.course || 'General'}`,
    start: new Date(`${cls.date.toISOString().split('T')[0]}T${cls.startTime}`),
    end: new Date(`${cls.date.toISOString().split('T')[0]}T${cls.endTime}`),
    extendedProps: {
      studentId: cls.student?._id,
      studentName: cls.student?.user?.name,
      course: cls.course?.name || cls.course,
      topic: cls.topic,
      status: cls.status,
      notes: cls.notes
    }
  }));

  res.json(events);
});