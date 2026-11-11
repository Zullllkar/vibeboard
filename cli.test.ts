import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "cli.js");

type ServerHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function listen(handler: ServerHandler): Promise<http.Server> {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function endpoint(server: http.Server): string {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server has no port");
  return `http://127.0.0.1:${address.port}/mcp`;
}

function startForwarder(url: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [cliPath, "mcp", "--url", url], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function captureStdout(child: ChildProcessWithoutNullStreams) {
  let buffered = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
  });
  return {
    text: () => buffered,
    async lines(count: number, timeoutMs: number): Promise<string[]> {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const ready = buffered.split("\n").filter((line) => line.length > 0);
        if (ready.length >= count) return ready.slice(0, count);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(
        `timed out waiting for ${count} JSON-RPC lines, stdout=${JSON.stringify(buffered)}`,
      );
    },
  };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe("cli mcp forwarder", () => {
  const children: ChildProcessWithoutNullStreams[] = [];
  const servers: http.Server[] = [];

  afterEach(async () => {
    for (const child of children.splice(0)) {
      child.kill();
      await once(child, "exit").catch(() => undefined);
    }
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  });

  it("keeps forwarding the next request after a body failure", async () => {
    let count = 0;
    const server = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        count += 1;
        if (count === 1) {
          res.writeHead(200, { "content-type": "application/json", "content-length": "100" });
          res.write("{");
          setTimeout(() => res.destroy(), 30);
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 8, result: { ok: true } }));
      });
    });
    servers.push(server);
    const child = startForwarder(endpoint(server));
    children.push(child);
    const stdout = captureStdout(child);

    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/list", params: {} })}\n`,
    );
    const lines = await stdout.lines(2, 3000);
    const first = JSON.parse(lines[0]) as { id: number; error: { code: number } };
    const second = JSON.parse(lines[1]) as { id: number; result: { ok: boolean } };

    expect(first.id).toBe(7);
    expect(first.error.code).toBe(-32000);
    expect(second).toEqual({ jsonrpc: "2.0", id: 8, result: { ok: true } });
  });

  it("does not append an error after an SSE result was already written", async () => {
    const server = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write('data: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n');
        setTimeout(() => res.destroy(), 40);
      });
    });
    servers.push(server);
    const child = startForwarder(endpoint(server));
    children.push(child);
    const stdout = captureStdout(child);

    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} })}\n`,
    );
    await stdout.lines(1, 2000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const lines = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({ jsonrpc: "2.0", id: 7, result: { ok: true } });
  });

  it("writes a JSON-RPC error when the bridge response body fails", async () => {
    const server = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json", "content-length": "100" });
        res.write("{");
        setTimeout(() => res.destroy(), 30);
      });
    });
    servers.push(server);
    const child = startForwarder(endpoint(server));
    children.push(child);

    const stdout = captureStdout(child);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} })}\n`,
    );
    const [line] = await stdout.lines(1, 2000);
    const message = JSON.parse(line) as {
      jsonrpc: string;
      id: number;
      error: { code: number; message: string };
    };

    expect(message.jsonrpc).toBe("2.0");
    expect(message.id).toBe(7);
    expect(message.error.code).toBe(-32000);
    expect(message.error.message).toContain("terminated");
  });
});
