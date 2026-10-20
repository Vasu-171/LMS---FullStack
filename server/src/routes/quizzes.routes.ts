import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  createQuiz,
  listQuizzes,
  getQuiz,
  submitQuiz,
  myAttempts,
  startLiveSession,
} from "../controllers/quizzes.controller";

const router = Router();

router.post("/courses/:courseId/quizzes", requireAuth, requireRole("TEACHER"), createQuiz);
router.get("/courses/:courseId/quizzes", requireAuth, listQuizzes);

// "attempts/mine" must come BEFORE "/quizzes/:id"
router.get("/quizzes/attempts/mine", requireAuth, requireRole("STUDENT"), myAttempts);
router.get("/quizzes/:id", requireAuth, requireRole("STUDENT"), getQuiz);
router.post("/quizzes/:id/submit", requireAuth, requireRole("STUDENT"), submitQuiz);
router.post("/quizzes/:id/live", requireAuth, requireRole("TEACHER"), startLiveSession);

export default router;