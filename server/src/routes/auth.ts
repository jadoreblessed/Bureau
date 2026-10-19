import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createChallenge, verifyChallenge, walletFor } from "../http/auth.js";
import { send, unauthorized } from "../http/errors.js";

const wallet = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "not a Solana address");

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/challenge", async (req, reply) => {
    try {
      const body = z.object({ wallet }).parse(req.body);
      return await createChallenge(body.wallet);
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post("/auth/verify", async (req, reply) => {
    try {
      const body = z.object({ wallet, nonce: z.string().min(8), signature: z.string().min(32) }).parse(req.body);
      const token = await verifyChallenge(body.wallet, body.nonce, body.signature);
      if (!token) throw unauthorized("that signature does not check out");
      return { token, wallet: body.wallet };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/auth/me", async (req, reply) => {
    try {
      const w = await walletFor(req);
      if (!w) throw unauthorized();
      return { wallet: w };
    } catch (err) {
      return send(reply, err);
    }
  });

}
