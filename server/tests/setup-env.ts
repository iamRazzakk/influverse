// Tests don't need real secrets — dummy values (setting them here isn't overridden by .env; dotenv doesn't touch existing vars)
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "mongodb://127.0.0.1:27017/influverse_test?replicaSet=rs0";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.JWT_USER_SECRET ??= "test-user-secret-test-user-secret-123456";
process.env.JWT_ADMIN_SECRET ??= "test-admin-secret-test-admin-secret-1234";
process.env.JWT_RESET_SECRET ??= "test-reset-secret-test-reset-secret-1234";
process.env.CORS_ORIGINS = "http://localhost:3000,http://localhost:5173";
