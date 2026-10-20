import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["TEACHER", "STUDENT"]).default("STUDENT"),
});
export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
export const courseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
});
export const materialSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  url: z.string().url("Enter a valid link (starting with http:// or https://)"),
  type: z.enum(["VIDEO", "PDF", "LINK"]).default("LINK"),
});
export const quizSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  questions: z
    .array(
      z.object({
        text: z.string().min(3, "Question text is too short"),
        options: z.array(z.string().min(1)).length(4, "Each question needs exactly 4 options"),
        correctIndex: z.number().int().min(0).max(3),
        timeLimit: z.number().int().min(5).max(120).default(20),
      })
    )
    .min(1, "Add at least 1 question"),
});

export const submitSchema = z.object({
  // one chosen option (0 to 3) per question: { "questionId": chosenIndex }
  answers: z.record(z.string(), z.number().int().min(0).max(3)),
});