import { isMaintenanceMode } from '../utils/settingsHelper.js';

/**
 * Maintenance mode middleware
 * Checks if maintenance mode is enabled and returns 503 if it is
 * Allows admin users to bypass maintenance mode
 */
const maintenanceMode = async (req, res, next) => {
  try {
    const maintenance = await isMaintenanceMode();

    // Allow admins and bypass routes to pass through
    if (maintenance && req.user?.role !== 'admin') {
      return res.status(503).json({
        success: false,
        message: 'System is under maintenance. Please try again later.',
      });
    }

    next();
  } catch (error) {
    console.error('Maintenance mode check error:', error);
    next(); // Continue even if check fails
  }
};

export default maintenanceMode;
