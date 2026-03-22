const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Global Setup before all tests
beforeAll(async () => {
  // Disconnect any existing connections
  await mongoose.disconnect();
  
  // Create a new MongoDB Memory Server instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect Mongoose to the memory server
  await mongoose.connect(mongoUri);
});

// Clear all data after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  jest.clearAllMocks();
});

// Disconnect and stop memory server after all tests
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Global Mocks for external services (Redis, Cloudinary, Twilio, etc) to ensure tests are isolated
jest.mock('./src/utils/cache.util.js', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  invalidatePattern: jest.fn().mockResolvedValue(true)
}), { virtual: true });
