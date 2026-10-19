import type { FastifyReply } from "fastify";

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code = "error") {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, "bad_request");
export const unauthorized = (msg = "sign in with your wallet") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "not yours") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "not found") => new HttpError(404, msg, "not_found");
export const conflict = (msg: string) => new HttpError(409, msg, "conflict");
export const disabled = (msg: string) => new HttpError(503, msg, "disabled");

export function send(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
  return reply.code(500).send({ error: "internal", message: "something broke on our side" });
}
