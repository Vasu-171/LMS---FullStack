import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./config/prisma";
import authRoutes from "./routes/auth.routes";
import courseRoutes from "./routes/courses.routes";
import materialRoutes from "./routes/materials.routes";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api", materialRoutes);

app.get("/api/health", async (_req, res) => {
  const users = await prisma.user.count();
  res.json({ status: "ok", users });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});