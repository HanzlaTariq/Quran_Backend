// const { body } = require('express-validator');

// const registerValidation = [
//   body('name').notEmpty().withMessage('Name is required'),
//   body('email').isEmail().withMessage('Please provide a valid email'),
//   body('password')
//     .isLength({ min: 6 })
//     .withMessage('Password must be at least 6 characters'),
//   body('role')
//     .optional()
//     .isIn(['student', 'parent', 'qari'])
//     .withMessage('Invalid role'),
// ];

// const loginValidation = [
//   body('email').isEmail().withMessage('Please provide a valid email'),
//   body('password').notEmpty().withMessage('Password is required'),
// ];

// const bookSessionValidation = [
//   body('qariId').notEmpty().withMessage('Qari ID is required'),
//   body('scheduledTime').isISO8601().withMessage('Invalid date format'),
//   body('duration').isInt({ min: 30, max: 120 }).withMessage('Duration must be between 30 and 120 minutes'),
// ];

// module.exports = {
//   registerValidation,
//   loginValidation,
//   bookSessionValidation,
// };