import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please add a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 10,
    select: false
  },
  role: {
    type: String,
    enum: ['student', 'ulma', 'admin'],
    default: 'student'
  },
  bookmarks: { type: [String], default: [] },
  reading: { surah: {type: Number, default: 1}, ayah: {type: Number, default: 1} },
  readingDays: {type: [String], default: []},
  theme: {type: String, enum: ['light','dark'], default: 'light'},
  translation: {type: String, enum: ['en','ur','none'], default: 'en'},
  profileImage: {
    type: String,
    default: 'default.jpg'
  },
  city: {type:String,default:''},
  gender: {type:String,enum:['male','female','unspecified'],default:'unspecified'},
  age: {type:Number,default:null},
  photoVersion: {type:Number,default:0},
  photoData: {type:Buffer,select:false},
  verifiedAt: Date,
  phone: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    default: ''
  },
  timezone: {
    type: String,
    default: ''
  },
  languages: [{
    type: String
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  lastIp: {
    type: String
  },
}, { timestamps: true });
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);