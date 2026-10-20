import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middleware/auth";
import { quizSchema, submitSchema } from "../utils/validators";


// Helper: is this student enrolled in the course?
async function isEnrolled(studentId: number, courseId: number) {
  const row = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  return row !== null;
}


// =====================================================
// TEACHER: create quiz + questions  (POST /api/courses/:courseId/quizzes)
// =====================================================
export async function createQuiz(req: AuthRequest, res: Response) {
  const courseId = Number(req.params.courseId);

  const result = quizSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  // Is this course MINE?
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.teacherId !== req.user!.id) {
    return res.status(403).json({ message: "This is not your course" });
  }

  // Save the quiz and all its questions together
  const quiz = await prisma.quiz.create({
    data: {
      title: result.data.title,
      courseId,
      questions: { create: result.data.questions },
    },
    include: { questions: true },
  });

  res.status(201).json(quiz);
}


// =====================================================
// LIST quizzes of a course  (GET /api/courses/:courseId/quizzes)
// =====================================================
export async function listQuizzes(req: AuthRequest, res: Response) {
  const courseId = Number(req.params.courseId);
  const user = req.user!;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  if (user.role === "STUDENT" && !(await isEnrolled(user.id, courseId))) {
    return res.status(403).json({ message: "Enroll in this course first" });
  }
  if (user.role === "TEACHER" && course.teacherId !== user.id) {
    return res.status(403).json({ message: "This is not your course" });
  }

  const quizzes = await prisma.quiz.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });

  res.json(
    quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      questionCount: q._count.questions,
    }))
  );
}


// =====================================================
// STUDENT: get questions to attempt  (GET /api/quizzes/:id)
// NOTE: correctIndex is NOT sent
// =====================================================
export async function getQuiz(req: AuthRequest, res: Response) {
  const quizId = Number(req.params.id);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { id: "asc" } } },
  });
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  if (!(await isEnrolled(req.user!.id, quiz.courseId))) {
    return res.status(403).json({ message: "Enroll in this course first" });
  }

  res.json({
    id: quiz.id,
    title: quiz.title,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options,
      timeLimit: q.timeLimit,
    })),
  });
}


// =====================================================
// STUDENT: submit answers  (POST /api/quizzes/:id/submit)
// =====================================================
export async function submitQuiz(req: AuthRequest, res: Response) {
  const quizId = Number(req.params.id);

  const result = submitSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: "Send your answers like {\"answers\": {\"1\": 2}}" });
  }
  const { answers } = result.data;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: true },
  });
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  if (!(await isEnrolled(req.user!.id, quiz.courseId))) {
    return res.status(403).json({ message: "Enroll in this course first" });
  }

  // Count correct answers (the server does the checking)
  let score = 0;
  for (const q of quiz.questions) {
    if (answers[String(q.id)] === q.correctIndex) score++;
  }

  const attempt = await prisma.quizAttempt.create({
    data: {
      studentId: req.user!.id,
      quizId,
      score,
      total: quiz.questions.length,
    },
  });

  res.status(201).json({ score, total: attempt.total });
}


// =====================================================
// STUDENT: my scores  (GET /api/quizzes/attempts/mine)
// =====================================================
export async function myAttempts(req: AuthRequest, res: Response) {
  const attempts = await prisma.quizAttempt.findMany({
    where: { studentId: req.user!.id },
    orderBy: { takenAt: "desc" },
    include: { quiz: { select: { title: true } } },
  });

  res.json(
    attempts.map((a) => ({
      id: a.id,
      quizTitle: a.quiz.title,
      score: a.score,
      total: a.total,
      takenAt: a.takenAt,
    }))
  );
}