// Express 4 internal used by lib/async-errors.ts (no published types).
declare module "express/lib/router/layer" {
  import type { NextFunction, Request, Response } from "express";

  type Handler = (...args: any[]) => unknown;

  interface Layer {
    handle: Handler;
    handle_request(req: Request, res: Response, next: NextFunction): void;
    handle_error(
      error: unknown,
      req: Request,
      res: Response,
      next: NextFunction
    ): void;
  }

  const Layer: {
    prototype: Layer;
  };

  export default Layer;
}
