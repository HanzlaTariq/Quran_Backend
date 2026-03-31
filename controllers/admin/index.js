// Export all admin controllers
export * from './dashboard.controller.js';
export * from './user.controller.js';
export * from './ulma.controller.js';
export * from './course.controller.js';
export * from './enrollment.controller.js';
export * from './payment.controller.js';
export * from './class.controller.js';
export * from './report.controller.js';
export * from './settings.controller.js';

// Also export the createAdmin function
export { createAdmin } from './user.controller.js';