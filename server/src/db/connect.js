import mongoose from 'mongoose';

export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) {
    console.warn('MONGODB_URI is not set: authentication endpoints remain unavailable.');
    return false;
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    ...(process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {}),
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5,
  });
  console.log('Quantum Coffee MongoDB connection established.');
  return true;
}

export function databaseReady() {
  return mongoose.connection.readyState === 1;
}
