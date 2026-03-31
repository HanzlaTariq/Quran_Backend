import Enrollment from '../models/Enrollment.js';
import Class from '../models/Class.js';

// Utility to generate classes for an enrollment
export const generateClassesForEnrollment = async (enrollmentId) => {
  try {
    const enrollment = await Enrollment.findById(enrollmentId).populate('student ulma course', 'name');

    if (!enrollment || enrollment.status !== 'approved') {
      throw new Error('Invalid enrollment');
    }

    // Check if classes already exist
    const existingClasses = await Class.countDocuments({ enrollment: enrollment._id });
    if (existingClasses > 0) {
      console.log(`Classes already exist for enrollment ${enrollmentId}`);
      return { success: true, message: 'Classes already exist' };
    }

    const classes = [];
    const scheduleDays = enrollment.schedule.days;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2); // Classes start in 2 days

    // Calculate total days based on course duration (duration is in months)
    const totalDays = enrollment.course.duration * 30; // Approximate 30 days per month

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

    // Create classes for the course duration
    for (let i = 0; i < totalDays; i++) {
      const classDate = new Date(startDate);
      classDate.setDate(classDate.getDate() + i);
      const dayName = classDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const shortDay = dayMap[dayName];

      if (scheduleDays.includes(shortDay)) {
        // Calculate UTC start and end times for this specific date
        const utcStart = new Date(enrollment.schedule.utcStart);
        const utcEnd = new Date(enrollment.schedule.utcEnd);

        // Set the date part to match the class date, keep the time part from enrollment
        utcStart.setFullYear(classDate.getFullYear(), classDate.getMonth(), classDate.getDate());
        utcEnd.setFullYear(classDate.getFullYear(), classDate.getMonth(), classDate.getDate());

        const newClass = await Class.create({
          student: enrollment.student._id,
          ulma: enrollment.ulma._id,
          enrollment: enrollment._id,
          course: enrollment.course,
          date: classDate,
          utcStart: utcStart,
          utcEnd: utcEnd,
          status: 'scheduled',
          topic: `Class ${classes.length + 1}` // Default topic
        });
        classes.push(newClass);
      }
    }

    return { success: true, classesCreated: classes.length };
  } catch (error) {
    console.error('Error generating classes:', error);
    return { success: false, error: error.message };
  }
};

// Generate classes for all approved enrollments without classes
export const generateClassesForAllEnrollments = async () => {
  try {
    const enrollments = await Enrollment.find({ status: 'approved' });

    let totalClasses = 0;
    for (const enrollment of enrollments) {
      const result = await generateClassesForEnrollment(enrollment._id);
      if (result.success && result.classesCreated) {
        totalClasses += result.classesCreated;
      }
    }

    return { success: true, totalClasses };
  } catch (error) {
    console.error('Error generating classes for all enrollments:', error);
    return { success: false, error: error.message };
  }
};