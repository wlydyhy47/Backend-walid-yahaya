# Food Delivery API

A powerful, robust backend for a multi-vendor food delivery platform built with Node.js, Express, MongoDB, and Redis.

## Features
- **Role-Based Access Control**: Highly secure authorization middleware supporting `client`, `driver`, `vendor`, and `admin` roles.
- **Robust Authentication**: JWT-based session management, refresh tokens, and strict password reset flows.
- **Fast Data Caching**: Intelligent Redis caching across high-traffic endpoints.
- **RESTful Architecture**: Structured controllers, semantic versioning (`v1`), and centralized error handling models.

---

## 🚀 Quick Start
### Prerequisites
- Node.js `v18+`
- MongoDB `v6+`
- Redis Server
- Cloudinary Account (for Image Uploads)

### Setup Instructions
1. **Clone the repository:**
   ```bash
   git clone <repository_url>
   cd Backend-walid-yahaya
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Rename `.env.example` to `.env` and configure the essential variables:
   ```env
   # Application
   PORT=3000
   NODE_ENV=development
   
   # Database Connections
   MONGODB_URI=mongodb://localhost:27017/food_delivery
   REDIS_URL=redis://localhost:6379
   
   # Security
   JWT_SECRET=your_super_secret_key
   JWT_EXPIRE=7d
   
   # Cloudinary
   CLOUDINARY_CLOUD_NAME=name
   CLOUDINARY_API_KEY=key
   CLOUDINARY_API_SECRET=secret
   ```

4. **Start the server:**
   ```bash
   # Development mode with hot-reload
   npm run dev
   
   # Production mode
   npm start
   ```

---

## 📚 API Documentation (Swagger)
The API leverages OpenAPI / Swagger for exhaustive endpoint documentation, request modeling, and test sandboxes.

**Once the server is running, the documentation is immediately accessible at:**
👉 `http://localhost:3000/api-docs`

Use the API Documentation to view standard Response Schemas, Error Models, and visually query any enabled endpoint. Authorization requires passing the JWT bearer token into the lock icon.

---

## 🧪 Testing and CI
The project uses Jest alongside `mongodb-memory-server` to perform unit and integration testing without risking your production or development databases.

To run the full suite:
```bash
npm test
```

A Husky Pre-commit hook is active by default. It runs the automated testing pipeline before verifying Git commits, strictly enforcing test compliance.

## Contribution
Check out styling guides and run ESLint checks before any major pull requests. Ensure all test parameters pass local validation.