import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";

type Role = "ADMIN" | "TEACHER" | "STUDENT";

interface Player {
  userId: number;
  name: string;
  score: number;
  answeredCurrent: boolean;
}

interface QuestionData {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
}

// Everything about a running session lives in memory
interface LiveState {
  sessionId: number;
  quizId: number;
  hostId: number;
  questions: QuestionData[];
  currentIndex: number;          // -1 = not started
  questionStartedAt: number;     // time the current question was sent
  players: Map<number, Player>;  // userId -> player
}

const sessions = new Map<string, LiveState>(); // joinCode -> state

// =====================================================
// HELPERS
// =====================================================
function leaderboard(state: LiveState) {
  return [...state.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ userId: p.userId, name: p.name, score: p.score }));
}

function lobbyList(state: LiveState) {
  return [...state.players.values()].map((p) => p.name);
}

// Ends the current question: shows answer + leaderboard
function endQuestion(io: Server, code: string, state: LiveState) {
  const q = state.questions[state.currentIndex];
  io.to(code).emit("question:end", {
    correctIndex: q.correctIndex,
    leaderboard: leaderboard(state),
    isLast: state.currentIndex === state.questions.length - 1,
  });
}

// =====================================================
// MAIN: connect the socket events
// =====================================================
export function setupLiveQuiz(io: Server) {
  // Check the token when a socket connects (same JWT as the REST API)
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: number;
        role: Role;
      };
      socket.data.user = { id: payload.id, role: payload.role };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: number; role: Role };

    // ---------- TEACHER opens the session ----------
    socket.on("host:join", async (joinCode: string, cb?: (res: any) => void) => {
      if (user.role !== "TEACHER") return cb?.({ error: "Teachers only" });

      const session = await prisma.liveSession.findUnique({
        where: { joinCode },
        include: {
          quiz: { include: { course: true, questions: { orderBy: { id: "asc" } } } },
        },
      });
      if (!session || session.quiz.course.teacherId !== user.id) {
        return cb?.({ error: "Session not found" });
      }

      // Create (or reuse) the in-memory state
      if (!sessions.has(joinCode)) {
        sessions.set(joinCode, {
          sessionId: session.id,
          quizId: session.quizId,
          hostId: user.id,
          questions: session.quiz.questions,
          currentIndex: -1,
          questionStartedAt: 0,
          players: new Map(),
        });
      }

      socket.join(joinCode);
      const state = sessions.get(joinCode)!;
      cb?.({ ok: true, players: lobbyList(state), total: state.questions.length });
    });

    // ---------- STUDENT joins with the code ----------
    socket.on("student:join", async (joinCode: string, cb?: (res: any) => void) => {
      if (user.role !== "STUDENT") return cb?.({ error: "Students only" });

      const state = sessions.get(joinCode);
      if (!state) return cb?.({ error: "Wrong code or session not open yet" });
      if (state.currentIndex >= 0) return cb?.({ error: "Quiz already started" });

      // Must be enrolled in the course
      const quiz = await prisma.quiz.findUnique({ where: { id: state.quizId } });
      const enrolled = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId: user.id, courseId: quiz!.courseId } },
      });
      if (!enrolled) return cb?.({ error: "You are not enrolled in this course" });

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

      state.players.set(user.id, {
        userId: user.id,
        name: dbUser!.name,
        score: 0,
        answeredCurrent: false,
      });

      socket.join(joinCode);
      socket.data.joinCode = joinCode;

      io.to(joinCode).emit("lobby:update", lobbyList(state));
      cb?.({ ok: true });
    });

    // ---------- TEACHER: next question ----------
    socket.on("host:next", (joinCode: string) => {
      const state = sessions.get(joinCode);
      if (!state || state.hostId !== user.id) return;

      // First time: mark the session as ACTIVE
      if (state.currentIndex === -1) {
        prisma.liveSession
          .update({ where: { id: state.sessionId }, data: { status: "ACTIVE" } })
          .catch(console.error);
      }

      // No more questions: finish the quiz
      if (state.currentIndex >= state.questions.length - 1) {
        finishQuiz(io, joinCode, state);
        return;
      }

      state.currentIndex++;
      state.questionStartedAt = Date.now();
      state.players.forEach((p) => (p.answeredCurrent = false));

      const q = state.questions[state.currentIndex];
      io.to(joinCode).emit("question", {
        index: state.currentIndex + 1,
        total: state.questions.length,
        text: q.text,
        options: q.options,
        timeLimit: q.timeLimit,
      });

      // When time runs out, end the question automatically
      const indexAtStart = state.currentIndex;
      setTimeout(() => {
        const s = sessions.get(joinCode);
        if (s && s.currentIndex === indexAtStart) endQuestion(io, joinCode, s);
      }, q.timeLimit * 1000);
    });

    // ---------- STUDENT: sends an answer ----------
    socket.on("student:answer", (choice: number, cb?: (res: any) => void) => {
      const joinCode = socket.data.joinCode as string | undefined;
      const state = joinCode ? sessions.get(joinCode) : undefined;
      if (!state) return;

      const player = state.players.get(user.id);
      if (!player || player.answeredCurrent || state.currentIndex < 0) return;

      const q = state.questions[state.currentIndex];
      const elapsed = (Date.now() - state.questionStartedAt) / 1000;
      if (elapsed > q.timeLimit + 1) return; // too late

      player.answeredCurrent = true;

      // Faster correct answer = more points (500 to 1000)
      let points = 0;
      if (choice === q.correctIndex) {
        const speedBonus = Math.max(0, 1 - elapsed / q.timeLimit);
        points = Math.round(500 + 500 * speedBonus);
        player.score += points;
      }

      cb?.({ correct: choice === q.correctIndex, points });

      // If everyone has answered, end the question early
      const allDone = [...state.players.values()].every((p) => p.answeredCurrent);
      if (allDone) endQuestion(io, joinCode!, state);
    });

    // ---------- STUDENT leaves ----------
    socket.on("disconnect", () => {
      const joinCode = socket.data.joinCode as string | undefined;
      const state = joinCode ? sessions.get(joinCode) : undefined;
      if (state && state.currentIndex === -1) {
        state.players.delete(user.id);
        io.to(joinCode!).emit("lobby:update", lobbyList(state));
      }
    });
  });
}

// =====================================================
// FINISH: save results and show the final leaderboard
// =====================================================
async function finishQuiz(io: Server, code: string, state: LiveState) {
  const board = leaderboard(state);

  // Save each student's result (score = their live points)
  await prisma.quizAttempt.createMany({
    data: [...state.players.values()].map((p) => ({
      studentId: p.userId,
      quizId: state.quizId,
      score: p.score,
      total: state.questions.length * 1000, // max possible points
    })),
  });

  await prisma.liveSession.update({
    where: { id: state.sessionId },
    data: { status: "FINISHED" },
  });

  io.to(code).emit("quiz:end", { leaderboard: board });
  sessions.delete(code);
}