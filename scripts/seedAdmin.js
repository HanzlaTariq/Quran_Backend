// backend/scripts/seedAdmin.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@quranacademy.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    
    const adminUser = await User.create({
      name: 'System Administrator',
      email: 'admin@quranacademy.com',
      password: hashedPassword,
      role: 'admin',
      phone: '+923001234567',
      country: 'Pakistan',
      timezone: 'UTC+5',
      languages: ['english', 'urdu', 'arabic'],
      isVerified: true,
      isActive: true,
    });

    console.log('Admin user created successfully:', {
      id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

// Run the seed function
seedAdmin();