import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middleware/auth";
import { materialSchema } from "../utils/validators";


// =====================================================
// TEACHER: add a material  (POST /api/courses/:courseId/materials)
// =====================================================
export async function addMaterial(req: AuthRequest, res: Response) {
  const courseId = Number(req.params.courseId);

  // Step 1: Validators
  const result = materialSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  // Step 2: Is this course MINE?
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.teacherId !== req.user!.id) {
    return res.status(403).json({ message: "This is not your course" });
  }

  // Step 3: Put the new material at the end of the list
  const count = await prisma.material.count({ where: { courseId } });
  const material = await prisma.material.create({
    data: { ...result.data, courseId, position: count + 1 },
  });

  res.status(201).json(material);
}


// =====================================================
// LIST materials  (GET /api/courses/:courseId/materials)
// Teacher of the course: sees all. Enrolled student: sees all + done flag.
// =====================================================
export async function listMaterials(req: AuthRequest, res: Response) {
  const courseId = Number(req.params.courseId);
  const user = req.user!;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  // Who is allowed to look?
  if (user.role === "STUDENT") {
    const enrolled = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: user.id, courseId } },
    });
    if (!enrolled) {
      return res.status(403).json({ message: "Enroll in this course first" });
    }
  } else if (user.role === "TEACHER" && course.teacherId !== user.id) {
    return res.status(403).json({ message: "This is not your course" });
  }

  const materials = await prisma.material.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    include: { progress: { where: { studentId: user.id } } },
  });

  // Turn the progress rows into a simple true/false
  res.json(
    materials.map((m) => ({
      id: m.id,
      title: m.title,
      url: m.url,
      type: m.type,
      position: m.position,
      completed: m.progress.length > 0,
    }))
  );
}


// =====================================================
// STUDENT: mark complete  (POST /api/materials/:id/complete)
// =====================================================
export async function markComplete(req: AuthRequest, res: Response) {
  const materialId = Number(req.params.id);
  const studentId = req.user!.id;

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) {
    return res.status(404).json({ message: "Material not found" });
  }

  // Student must be enrolled in that material's course
  const enrolled = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId: material.courseId } },
  });
  if (!enrolled) {
    return res.status(403).json({ message: "Enroll in this course first" });
  }

  // upsert = create if missing, do nothing if it already exists
  await prisma.materialProgress.upsert({
    where: { studentId_materialId: { studentId, materialId } },
    update: {},
    create: { studentId, materialId },
  });

  res.json({ message: "Marked as complete" });
}


// =====================================================
// STUDENT: progress of a course  (GET /api/courses/:courseId/progress)
// =====================================================
export async function courseProgress(req: AuthRequest, res: Response) {
  const courseId = Number(req.params.courseId);
  const studentId = req.user!.id;

  const enrolled = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  if (!enrolled) {
    return res.status(403).json({ message: "Enroll in this course first" });
  }

  const total = await prisma.material.count({ where: { courseId } });
  const completed = await prisma.materialProgress.count({
    where: { studentId, material: { courseId } },
  });

  res.json({
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  });
}