import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { realpathSync, statSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Works from both src/http and compiled dist/http, regardless of cwd. */
export const DEFAULT_WEB_DIST = fileURLToPath(
  new URL("../../../web/dist", import.meta.url),
);
function inside(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
function notFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: { code: "not_found", message: "This route does not exist." },
  });
}
function safePath(request: FastifyRequest): string | null {
  const encoded = (request.raw.url ?? request.url).split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || /[\\\0%?#]/.test(decoded)) return null;
  if (decoded.split("/").some((segment) => segment.startsWith(".")))
    return null;
  if (/^\/(?:api|auth|health)(?:\/|$)/i.test(decoded)) return null;
  return decoded;
}
function browserPath(path: string): boolean {
  return (
    path === "/" ||
    /^\/(?:studio(?:\/[^/]+)?|world\/[^/]+|overlay\/[^/]+)\/?$/.test(path)
  );
}

/** Static serving is optional: a missing build keeps the backend usable alone. */
export function configureFrontend(
  app: FastifyInstance,
  directory?: string | false,
): void {
  let root: string | undefined;
  if (directory !== false) {
    try {
      const candidate = realpathSync(resolve(directory ?? DEFAULT_WEB_DIST));
      const index = realpathSync(resolve(candidate, "index.html"));
      if (inside(candidate, index) && statSync(index).isFile())
        root = candidate;
    } catch {
      /* No built frontend: retain ordinary JSON 404 responses. */
    }
  }
  if (root)
    app.register(fastifyStatic, {
      root,
      serve: false,
      index: false,
      dotfiles: "deny",
      redirect: false,
    });
  app.setNotFoundHandler(async (request, reply) => {
    if (!root || !["GET", "HEAD"].includes(request.method))
      return notFound(reply);
    const path = safePath(request);
    if (!path) return notFound(reply);
    const spa = browserPath(path);
    // An explicit JSON request should not receive the SPA document.
    if (
      spa &&
      request.headers.accept &&
      !/(?:text\/html|\*\/\*)/.test(request.headers.accept)
    )
      return notFound(reply);
    const candidate = resolve(root, spa ? "index.html" : path.slice(1));
    if (!inside(root, candidate)) return notFound(reply);
    let file: string;
    try {
      file = await realpath(candidate);
      if (!inside(root, file) || !(await stat(file)).isFile())
        return notFound(reply);
    } catch {
      return notFound(reply);
    }
    const filename = relative(root, file);
    const immutable = !spa && /^assets\/.*-[\w-]{8,}\.[\w]+$/.test(filename);
    if (spa || filename === "index.html")
      reply.header("Cache-Control", "no-store");
    return reply.sendFile(filename, root, {
      maxAge: immutable ? 31536000000 : 0,
      immutable,
      cacheControl: !(spa || filename === "index.html"),
    });
  });
}
