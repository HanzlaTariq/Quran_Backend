import moment from 'moment-timezone';
const DEFAULT_TIMEZONE = 'UTC';

export const parseTimeHHMM = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { hours: h, minutes: m };
};

export const localTimeToUTC = (timeStr, timezone = DEFAULT_TIMEZONE, referenceDate = new Date()) => {
  const parsed = parseTimeHHMM(timeStr);
  if (!parsed) return null;

  const sourceDate = moment.tz(referenceDate, timezone);
  sourceDate.hours(parsed.hours).minutes(parsed.minutes).seconds(0);

  const utcDate = sourceDate.utc();
  return utcDate.format('HH:mm');
};

export const localTimeToUTCISO = (timeStr, timezone = DEFAULT_TIMEZONE, referenceDate = new Date()) => {
  const parsed = parseTimeHHMM(timeStr);
  if (!parsed) return null;

  const sourceDate = moment.tz(referenceDate, timezone);
  sourceDate.hours(parsed.hours).minutes(parsed.minutes).seconds(0);

  const utcDate = sourceDate.utc();
  return utcDate.toISOString();
};

export const normalizeScheduleToUTC = (schedule = {}) => {
  const studentTimezone = schedule.studentTimezone || DEFAULT_TIMEZONE;
  const localStart = schedule.originalStartTime || schedule.startTime;
  const localEnd = schedule.originalEndTime || schedule.endTime;

  // If original value is present, treat as local student timezone and convert.
  const startUTC = localStart ? localTimeToUTC(localStart, studentTimezone) : schedule.startTime;
  const endUTC = localEnd ? localTimeToUTC(localEnd, studentTimezone) : schedule.endTime;

  const utcStartISO = localStart ? localTimeToUTCISO(localStart, studentTimezone) : schedule.utcStart || null;
  const utcEndISO = localEnd ? localTimeToUTCISO(localEnd, studentTimezone) : schedule.utcEnd || null;

  return {
    ...schedule,
    studentTimezone,
    teacherTimezone: schedule.teacherTimezone || DEFAULT_TIMEZONE,
    startTime: startUTC || schedule.startTime,
    endTime: endUTC || schedule.endTime,
    utcStart: utcStartISO || schedule.utcStart || null,
    utcEnd: utcEndISO || schedule.utcEnd || null,
    originalStartTime: schedule.originalStartTime || schedule.startTime,
    originalEndTime: schedule.originalEndTime || schedule.endTime,
    durationMinutes:
      schedule.durationMinutes ||
      (startUTC && endUTC
        ? (parseInt(endUTC.split(':')[0], 10) * 60 + parseInt(endUTC.split(':')[1], 10)) -
          (parseInt(startUTC.split(':')[0], 10) * 60 + parseInt(startUTC.split(':')[1], 10))
        : null),
  };
};
