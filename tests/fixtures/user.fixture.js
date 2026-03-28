const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Define IDs
const adminId = new mongoose.Types.ObjectId().toString();
const storeOwnerId = new mongoose.Types.ObjectId().toString();
const driverId = new mongoose.Types.ObjectId().toString();
const clientId = new mongoose.Types.ObjectId().toString();
const deactivatedId = new mongoose.Types.ObjectId().toString();

// Common fields
const userBase = {
  isActive: true,
  isVerified: true
};

const users = {
  admin: {
    _id: adminId,
    name: "Admin User",
    role: "admin",
    ...userBase
  },
  storeOwner: {
    _id: storeOwnerId,
    name: "Store Owner",
    role: "vendor",
    storeOwnerInfo: {
      store: new mongoose.Types.ObjectId().toString()
    },
    ...userBase
  },
  driver: {
    _id: driverId,
    name: "Driver User",
    role: "driver",
    driverInfo: {
      isAvailable: true
    },
    isOnline: true,
    ...userBase
  },
  client: {
    _id: clientId,
    name: "Client User",
    role: "client",
    ...userBase
  },
  deactivated: {
    _id: deactivatedId,
    name: "Deactivated User",
    role: "client",
    isActive: false,
    isVerified: true
  }
};

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;

const generateToken = (userId, secret = JWT_SECRET, expiresIn = '1h') => {
  return jwt.sign({ id: userId }, secret, { expiresIn, algorithm: 'HS256' });
};

module.exports = {
  users,
  generateToken,
  JWT_SECRET
};
