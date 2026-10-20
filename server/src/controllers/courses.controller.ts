import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middleware/auth";
import { courseSchema } from "../utils/validators";


// =====================================================
// TEACHER: create a course  (POST /api/courses)
// =====================================================
export async function createCourse(req: AuthRequest, res: Response) {
  // Step 1: Validators. Is the data valid?
  const result = courseSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  // Step 2: Prisma. Save the course. teacherId comes from the TOKEN, not from the user's input
  const course = await prisma.course.create({
    data: { ...result.data, teacherId: req.user!.id },
  });

  res.status(201).json(course);
}


// =====================================================
// ANYONE LOGGED IN: list all courses  (GET /api/courses)
// =====================================================
export async function listCourses(_req: AuthRequest, res: Response) {
  const courses = await prisma.course.findMany({
    include: { teacher: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.json(courses);
}


// =====================================================
// STUDENT: enroll in a course  (POST /api/courses/:id/enroll)
// =====================================================
export async function enroll(req: AuthRequest, res: Response) {
  const courseId = Number(req.params.id);

  // Step 1: Does the course exist?
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  // Step 2: Already enrolled?
  const existing = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: req.user!.id, courseId } },
  });
  if (existing) {
    return res.status(400).json({ message: "You are already enrolled" });
  }

  // Step 3: Save the enrollment
  const enrollment = await prisma.enrollment.create({
    data: { studentId: req.user!.id, courseId },
  });

  res.status(201).json(enrollment);
}


// =====================================================
// STUDENT: my enrolled courses  (GET /api/courses/mine)
// =====================================================
export async function myCourses(req: AuthRequest, res: Response) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: req.user!.id },
    include: {
      course: { include: { teacher: { select: { name: true } } } },
    },
  });

  res.json(enrollments.map((e) => e.course));
}