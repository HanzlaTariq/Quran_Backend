export const ulmaOnly = (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authenticated');
  }

  if (req.user.role !== 'ulma') {
    res.status(403);
    throw new Error('Access denied: Ulma only');
  }

  next();
};

export const studentOnly = (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authenticated');
  }

  if (req.user.role !== 'student') {
    res.status(403);
    throw new Error('Access denied: Students only');
  }

  next();
};
