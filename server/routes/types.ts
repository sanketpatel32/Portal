export type RouteContext = {
  req: Request;
  url: URL;
  clientIp: string;
  server: Bun.Server;
};

export type RouteHandler = (ctx: RouteContext) => Promise<Response | null>;
