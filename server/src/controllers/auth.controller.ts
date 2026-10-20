import { Request, Response } from "express";   // types for request and reply
import bcrypt from "bcrypt";                   // scramble and compare passwords
import jwt from "jsonwebtoken";                // create login tokens
import { User } from "@prisma/client";         // the User type from our schema
import { prisma } from "../config/prisma";     // database connection
import { registerSchema, loginSchema } from "../utils/validators"; // Zod rules

// Makes a login token that holds the user's id and role
function createToken(user: User) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );
}

// Picks only the safe fields to send back (never the password)
function safeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}


// =====================================================
// SECTION 3: REGISTER  (POST /api/auth/register)
// =====================================================
export async function register(req: Request, res: Response) {
  // Step 1: Validators. Is the data valid?
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }
  const { name, email, password, role } = result.data;

  // Step 2: Prisma. Is this email already used?
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ message: "Email already registered" });
  }

  // Step 3: bcrypt + Prisma. Scramble the password, then save the user
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, role },
  });

  // Step 4: JWT + reply
  res.status(201).json({
    token: createToken(user),
    user: safeUser(user),
  });
}


// =====================================================
// SECTION 4: LOGIN  (POST /api/auth/login)
// =====================================================
export async function login(req: Request, res: Response) {
  // Step 1: Validators. Is the data valid?
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }
  const { email, password } = result.data;

  // Step 2: Prisma. Find the user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  // Step 3: bcrypt. Does the typed password match the saved one?
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  // Step 4: JWT + reply
  res.json({
    token: createToken(user),
    user: safeUser(user),
  });
}