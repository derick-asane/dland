import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/** Validates req.body; the parsed value replaces the body. */
export const validateBody = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  req.body = schema.parse(req.body ?? {});
  next();
};

/** Parses query params (Express 5 makes req.query read-only, so the result is returned). */
export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return schema.parse(req.query);
}

/** Express 5 types route params as string | string[]; our routes only use single segments. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}
