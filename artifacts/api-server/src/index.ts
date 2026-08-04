import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtime } from "./realtime";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);
attachRealtime(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + Socket.IO)");
});
