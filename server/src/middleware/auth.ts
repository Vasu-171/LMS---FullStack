import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type Role = "ADMIN" | "TEACHER" | "STUDENT";

// A normal request, plus the logged-in user's info
export interface AuthRequest extends Request {
  user?: { id: number; role: Role };
}

// =====================================================
// GUARD 1: Is the user logged in?
// =====================================================
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Step 1: Read the token from the header ("Bearer <token>")
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ message: "Please log in" });
  }

  // Step 2: Verify the token with our secret
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      role: Role;
    };

    // Step 3: Remember who this is, then let the request continue
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// =====================================================
// GUARD 2: Does the user have the right role?
// =====================================================
export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You are not allowed to do this" });
    }
    next();
  };
}