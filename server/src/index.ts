import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { prisma } from "./config/prisma";
import authRoutes from "./routes/auth.routes";
import courseRoutes from "./routes/courses.routes";
import materialRoutes from "./routes/materials.routes";
import quizRoutes from "./routes/quizzes.routes";
import { setupLiveQuiz } from "./sockets/liveQuiz";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api", materialRoutes);
app.use("/api", quizRoutes);

app.get("/api/health", async (_req, res) => {
  const users = await prisma.user.count();
  res.json({ status: "ok", users });
});

// Express + Socket.IO share one server
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL } });
setupLiveQuiz(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});