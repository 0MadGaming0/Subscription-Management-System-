const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * Ensures strict query mode and robust connection event listeners.
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is not defined in environment variables.');
  }

  try {
    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(mongoUri, {
      autoIndex: true, // Build indexes in development; set to false in high-scale production if needed
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[Database] MongoDB Connected successfully: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error(`[Database Error] Connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database Warning] MongoDB disconnected. Attempting reconnection...');
    });

    return conn;
  } catch (error) {
    console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;

