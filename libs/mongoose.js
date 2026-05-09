import mongoose from "mongoose";

const connectMongo = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "Add the MONGODB_URI environment variable inside .env.local to use mongoose"
    );
  }

  // In development, Next.js hot reload creates new connections each time.
  // Cache the connection on globalThis to reuse across hot reloads.
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  return mongoose
    .connect(process.env.MONGODB_URI)
    .catch((e) => console.error("Mongoose Client Error: " + e.message));
};

export default connectMongo;
