import mongoose from "mongoose";
import config from ".";
import { logger } from "../shared/logger";

mongoose.set("strictQuery", true);

export const connectDB = async (): Promise<void> => {
  await mongoose.connect(config.databaseUrl, {
    serverSelectionTimeoutMS: 10_000,
    // Indexes: built via migration/script in production; auto in dev
    autoIndex: !config.isProd,
    // Resolve hostnames to IPv4 only. On Windows "localhost" resolves to ::1 first, which can hit a
    // different MongoDB (e.g. a Docker container) than the one on 127.0.0.1.
    family: 4,
  });

  // Money flows and register use transactions, which need a replica set (or mongos).
  // Fail at startup with a clear message instead of failing on the first signup.
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    await mongoose.disconnect();
    throw new Error(
      "MongoDB is not a replica set — transactions will fail. " +
        "Start mongod with --replSet rs0 (run rs.initiate() once) and add ?replicaSet=rs0 to DATABASE_URL.",
    );
  }
  logger.info(`MongoDB connected (replica set: ${hello.setName ?? "mongos"})`);
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
};
