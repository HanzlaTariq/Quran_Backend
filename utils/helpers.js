// const getPagination = (page, size) => {
//   const limit = size ? +size : 10;
//   const offset = page ? page * limit : 0;

//   return { limit, offset };
// };

// const getPagingData = (data, page, limit) => {
//   const { count: totalItems, rows: items } = data;
//   const currentPage = page ? +page : 0;
//   const totalPages = Math.ceil(totalItems / limit);

//   return { totalItems, items, totalPages, currentPage };
// };

// const generateMeetingId = () => {
//   return Math.random().toString(36).substring(2, 15) + 
//          Math.random().toString(36).substring(2, 15);
// };

// const formatDuration = (minutes) => {
//   const hours = Math.floor(minutes / 60);
//   const mins = minutes % 60;
  
//   if (hours > 0) {
//     return `${hours}h ${mins}m`;
//   }
//   return `${mins}m`;
// };

// module.exports = {
//   getPagination,
//   getPagingData,
//   generateMeetingId,
//   formatDuration,
// };