import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'admin'], required: true, default: 'customer' },
  emailVerifiedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });
userSchema.index({ email: 1 }, { unique: true });
export default mongoose.model('User', userSchema);
