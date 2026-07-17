import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, signToken } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email and password are required" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { businessUnits: { select: { businessUnitId: true } } },
  });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const authUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    businessUnitIds: user.businessUnits.map((b) => b.businessUnitId),
  };
  const token = signToken(authUser);
  res.json({ token, user: authUser });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
