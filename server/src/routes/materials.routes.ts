import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  addMaterial,
  listMaterials,
  markComplete,
  courseProgress,
} from "../controllers/materials.controller";

const router = Router();

// Routes under /api/courses/:courseId/...
router.post("/courses/:courseId/materials", requireAuth, requireRole("TEACHER"), addMaterial);
router.get("/courses/:courseId/materials", requireAuth, listMaterials);
router.get("/courses/:courseId/progress", requireAuth, requireRole("STUDENT"), courseProgress);

// Route under /api/materials/:id
router.post("/materials/:id/complete", requireAuth, requireRole("STUDENT"), markComplete);

export default router;