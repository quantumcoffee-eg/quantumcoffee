import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../db/connect.js';
import User from '../models/User.js';
import { hashPassword, passwordError } from '../security/password.js';

async function main() {
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') throw new Error('Set ALLOW_ADMIN_BOOTSTRAP=true for this one-time operation.');
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || passwordError(password)) throw new Error('Provide valid ADMIN_BOOTSTRAP_EMAIL and a strong password (12–128 characters).');
  if (!(await connectDatabase())) throw new Error('MONGODB_URI missing');
  if (await User.exists({ email })) throw new Error('Account already exists. Refusing to upgrade or overwrite it.');
  const admin = await User.create({ name: 'Quantum Coffee Admin', email, passwordHash: await hashPassword(password), role: 'admin', emailVerifiedAt: new Date() });
  console.log(`Created admin: ${admin.email}. Remove bootstrap secrets and disable ALLOW_ADMIN_BOOTSTRAP now.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
