// Helper function to calculate duration in minutes
export const calculateDuration = (classItem) => {
  if (classItem.utcStart && classItem.utcEnd) {
    // Calculate from UTC Date objects
    const start = new Date(classItem.utcStart);
    const end = new Date(classItem.utcEnd);
    return Math.round((end - start) / (1000 * 60)); // Convert milliseconds to minutes
  } else if (classItem.startTime && classItem.endTime) {
    // Fallback for legacy string format
    const [startHour, startMinute] = classItem.startTime.split(':').map(Number);
    const [endHour, endMinute] = classItem.endTime.split(':').map(Number);

    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;

    return end - start;
  }
  return 0;
};

// Helper function to check if two time slots overlap
export const doTimeSlotsOverlap = (slot1, slot2) => {
  return (
    (slot1.startTime <= slot2.startTime && slot1.endTime > slot2.startTime) ||
    (slot1.startTime < slot2.endTime && slot1.endTime >= slot2.endTime) ||
    (slot1.startTime >= slot2.startTime && slot1.endTime <= slot2.endTime)
  );
};

// Helper function to format class time
export const formatClassTime = (date, startTime, endTime) => {
  return {
    date: new Date(date),
    start: startTime,
    end: endTime,
    formatted: `${new Date(date).toLocaleDateString()} ${startTime} - ${endTime}`
  };
};