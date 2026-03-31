import asyncHandler from 'express-async-handler';
import Ulma from '../../models/Ulma.js';
import Student from '../../models/Student.js';
import Class from '../../models/Class.js';
import Course from '../../models/Course.js';
import Enrollment from '../../models/Enrollment.js';
import Attendance from '../../models/Attendance.js';
import { calculateDuration } from '../utils/class.utils.js';
import { io } from '../../socket/socketServer.js';

// @desc    Get single class
// @route   GET /api/ulma/classes/:id
// @access  Private/Ulma
export const getClass = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(req.params.id)
    .populate('student', 'user')
    .populate({
      path: 'student',
      populate: {
        path: 'user',
        select: 'name'
      }
    });

  if (!classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Class not found or not authorized');
  }

  res.json({
    success: true,
    class: classItem,
  });
});

// @desc    Create class
// @route   POST /api/ulma/classes
// @access  Private/Ulma
export const createClass = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const { studentId, date, startTime, endTime, course, topic, notes, meetingLink } = req.body;

  const student = await Student.findById(studentId).populate('currentCourse');

  if (!student || student.currentUlma.toString() !== ulma._id.toString()) {
    res.status(403);
    throw new Error('Student is not assigned to you');
  }

  // Find course ObjectId
  let courseId = student.currentCourse?._id;
  if (course) {
    const courseDoc = await Course.findOne({ name: course });
    if (courseDoc) {
      courseId = courseDoc._id;
    }
  }

  // Check if ulma is available at this time
  const conflictingClass = await Class.findOne({
    ulma: ulma._id,
    date: new Date(date),
    $or: [
      {
        $and: [
          { startTime: { $lte: startTime } },
          { endTime: { $gt: startTime } }
        ]
      },
      {
        $and: [
          { startTime: { $lt: endTime } },
          { endTime: { $gte: endTime } }
        ]
      },
      {
        $and: [
          { startTime: { $gte: startTime } },
          { endTime: { $lte: endTime } }
        ]
      }
    ],
    status: { $in: ['scheduled', 'ongoing'] },
  });

  if (conflictingClass) {
    res.status(400);
    throw new Error('You already have a class scheduled at this time');
  }

  const classItem = await Class.create({
    ulma: ulma._id,
    student: studentId,
    course: courseId,
    date: new Date(date),
    utcStart: new Date(`${date}T${startTime}:00Z`),
    utcEnd: new Date(`${date}T${endTime}:00Z`),
    topic: topic || `${student.currentCourse?.name || 'Quran'} Class`,
    notes: notes || '',
    meetingLink: meetingLink || '',
    status: 'scheduled',
  });

  const populatedClass = await Class.findById(classItem._id)
    .populate({
      path: 'student',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name email profileImage'
      }
    })
    .populate('course', 'name');

  res.status(201).json({
    success: true,
    message: 'Class created successfully',
    class: populatedClass,
  });
});

// @desc    Update class
// @route   PUT /api/ulma/classes/:id
// @access  Private/Ulma
export const updateClass = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(req.params.id);

  if (!classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Class not found or not authorized');
  }

  // Only allow updates for scheduled classes
  if (classItem.status !== 'scheduled') {
    res.status(400);
    throw new Error('Only scheduled classes can be updated');
  }

  const { date, startTime, endTime, topic, notes, meetingLink } = req.body;

  if (date) classItem.date = new Date(date);
  if (startTime) classItem.startTime = startTime;
  if (endTime) classItem.endTime = endTime;
  if (topic) classItem.topic = topic;
  if (notes !== undefined) classItem.notes = notes;
  if (meetingLink !== undefined) classItem.meetingLink = meetingLink;

  await classItem.save();

  // Populate student and course data before sending response
  const populatedClass = await Class.findById(classItem._id)
    .populate({
      path: 'student',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name email profileImage'
      }
    })
    .populate('course', 'name');

  res.json({
    success: true,
    message: 'Class updated successfully',
    class: populatedClass,
  });
});

// @desc    Delete class
// @route   DELETE /api/ulma/classes/:id
// @access  Private/Ulma
export const deleteClass = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(req.params.id);

  if (!classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Class not found or not authorized');
  }

  // Only allow deletion for scheduled classes
  if (classItem.status !== 'scheduled') {
    res.status(400);
    throw new Error('Only scheduled classes can be deleted');
  }

  await Class.deleteOne({ _id: classItem._id });

  res.json({
    success: true,
    message: 'Class deleted successfully',
  });
});

// @desc    Mark attendance
// @route   POST /api/ulma/classes/:id/attendance
// @access  Private/Ulma
export const markAttendance = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(req.params.id);

  if (!classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Class not found or not authorized');
  }

  // Allow attendance marking for ongoing or completed classes
  if (!['ongoing', 'completed'].includes(classItem.status)) {
    res.status(400);
    throw new Error('Attendance can only be marked for ongoing or completed classes');
  }

  let { attendance, progress } = req.body;

  if (typeof attendance === 'string') {
    const norm = attendance.trim().toLowerCase();
    if (norm === 'true' || norm === 'present') attendance = 'present';
    else if (norm === 'false' || norm === 'absent') attendance = 'absent';
    else if (norm === 'late') attendance = 'late';
  }

  let attendanceStatus;
  if (attendance === 'late' || attendance === 'present' || attendance === 'absent') {
    attendanceStatus = attendance;
  } else if (typeof attendance === 'boolean') {
    attendanceStatus = attendance ? 'present' : 'absent';
  } else {
    attendanceStatus = 'present';
  }

  // Ensure we have a valid enrollment for this student + ulma
  const enrollment = await Enrollment.findOne({
    student: classItem.student,
    ulma: ulma._id,
    status: { $in: ['approved', 'active'] }
  });

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found for this class');
  }

  const attendanceDate = new Date(classItem.date);
  attendanceDate.setHours(0, 0, 0, 0);

  const attendanceRecord = await Attendance.findOneAndUpdate(
    {
      enrollment: enrollment._id,
      date: attendanceDate
    },
    {
      student: classItem.student,
      ulma: ulma._id,
      enrollment: enrollment._id,
      date: attendanceDate,
      status: attendanceStatus,
      remarks: req.body.remarks || '',
      markedBy: req.user.id
    },
    { upsert: true, new: true }
  );

  classItem.attendance = attendanceRecord._id;

  if (progress) {
    classItem.progress = {
      ...classItem.progress,
      ...progress,
      updatedAt: new Date(),
    };
  }

  await classItem.save();

  // Update student's overall attendance percentage based on Attendance collection
  if (attendance !== undefined) {
    const attendanceRecords = await Attendance.find({
      enrollment: enrollment._id
    });

    const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
    const totalCount = attendanceRecords.length;

    await Student.findByIdAndUpdate(classItem.student, {
      'progress.attendancePercentage': totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
      'progress.totalClasses': totalCount,
    });
  }

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    class: classItem,
  });
});

// @desc    Start live class
// @route   POST /api/ulma/classes/:id/start
// @access  Private/Ulma
export const startLiveClass = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });

  if (!ulma) {
    res.status(404);
    throw new Error('Ulma profile not found');
  }

  const classItem = await Class.findById(req.params.id);

  if (!classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Class not found or not authorized');
  }

  if (classItem.status === 'completed' || classItem.status === 'cancelled') {
    res.status(400);
    throw new Error(`Cannot start a ${classItem.status} class`);
  }

  if (classItem.status === 'ongoing') {
    return res.json({
      success: true,
      message: 'Class is already ongoing',
      meetingLink: classItem.meetingLink,
      class: classItem,
    });
  }

  // Use existing meeting link or generate new one
  const meetingLink = classItem.meetingLink || `https://meet.quranacademy.com/${classItem._id}-${Date.now()}`;

  classItem.status = 'ongoing';
  classItem.meetingLink = meetingLink;

  // Maintain Attendance record as well (auto present when started)
  const enrollment = await Enrollment.findOne({
    student: classItem.student,
    ulma: ulma._id,
    status: { $in: ['approved', 'active'] }
  });

  if (enrollment) {
    const attendanceDate = new Date(classItem.date);
    attendanceDate.setHours(0, 0, 0, 0);

    const attendanceRecord = await Attendance.findOneAndUpdate(
      {
        enrollment: enrollment._id,
        date: attendanceDate
      },
      {
        student: classItem.student,
        ulma: ulma._id,
        enrollment: enrollment._id,
        date: attendanceDate,
        status: 'present',
        remarks: 'Auto-marked when class started',
        markedBy: req.user.id
      },
      { upsert: true, new: true }
    );

    classItem.attendance = attendanceRecord._id;
  }

  await classItem.save();

  const studentProfile = await Student.findById(classItem.student).select('user');
  const studentUserId = studentProfile?.user ? studentProfile.user.toString() : null;

  // Notify student that class has started
  io.to(classItem.student.toString()).emit('class-started', {
    classId: classItem._id,
    status: 'ongoing',
    meetingLink,
    utcStart: classItem.utcStart,
    utcEnd: classItem.utcEnd
  });

  if (studentUserId) {
    io.to(studentUserId).emit('class-started', {
      classId: classItem._id,
      status: 'ongoing',
      meetingLink,
      utcStart: classItem.utcStart,
      utcEnd: classItem.utcEnd
    });
  }

  res.json({
    success: true,
    message: 'Live class started successfully',
    meetingLink,
    class: classItem,
  });
});

// @desc    End live class
// @route   POST /api/ulma/classes/:id/end
// @access  Private/Ulma
export const endLiveClass = asyncHandler(async (req, res) => {
  const ulma = await Ulma.findOne({ user: req.user.id });
  const classItem = await Class.findById(req.params.id);

  if (!classItem || classItem.ulma.toString() !== ulma._id.toString()) {
    res.status(404);
    throw new Error('Class not found or not authorized');
  }

  if (classItem.status !== 'ongoing') {
    res.status(400);
    throw new Error('Only ongoing classes can be ended');
  }

  const { recordingUrl, notes, progress } = req.body;

  classItem.status = 'completed';
  classItem.recordingUrl = recordingUrl || classItem.recordingUrl;
  classItem.notes = notes || classItem.notes;

  if (progress) {
    classItem.progress = {
      ...classItem.progress,
      ...progress,
    };
  }

  // Mark attendance as present for the record and associate with class
  const enrollment = await Enrollment.findOne({
    student: classItem.student,
    ulma: ulma._id,
    status: { $in: ['approved', 'active'] }
  });

  if (enrollment) {
    const attendanceDate = new Date(classItem.date);
    attendanceDate.setHours(0, 0, 0, 0);

    const attendanceRecord = await Attendance.findOneAndUpdate(
      {
        enrollment: enrollment._id,
        date: attendanceDate
      },
      {
        student: classItem.student,
        ulma: ulma._id,
        enrollment: enrollment._id,
        date: attendanceDate,
        status: 'present',
        remarks: 'Auto-marked when class ended',
        markedBy: req.user.id
      },
      { upsert: true, new: true }
    );

    classItem.attendance = attendanceRecord._id;
  }

  await classItem.save();

  // Update ulma's total classes count
  await Ulma.findByIdAndUpdate(ulma._id, {
    $inc: { totalClassesConducted: 1 },
  });

  // Update student's progress
  const student = await Student.findById(classItem.student);
  student.progress.totalClasses += 1;
  await student.save();

  res.json({
    success: true,
    message: 'Live class ended successfully',
    class: classItem,
  });
});