import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  createCourse,
  listCourses,
  enroll,
  myCourses,
} from "../controllers/courses.controller";

const router = Router();

router.get("/", requireAuth, listCourses);
router.post("/", requireAuth, requireRole("TEACHER"), createCourse);

// "/mine" must come BEFORE "/:id/..." routes
router.get("/mine", requireAuth, requireRole("STUDENT"), myCourses);
router.post("/:id/enroll", requireAuth, requireRole("STUDENT"), enroll);

export default router;