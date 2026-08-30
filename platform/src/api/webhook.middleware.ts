import { Request, Response, NextFunction } from 'express';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function captureRawBody(req: RequestWithRawBody, res: Response, buf: Buffer, encoding: string) {
  if (buf && buf.length) {
    req.rawBody = buf;
  }
}
