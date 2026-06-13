import { spawn } from "child_process";

console.log("\x1b[35m%s\x1b[0m", "⚡ AuraFlow Orchestrator Starting...");
console.log("\x1b[36m%s\x1b[0m", "-----------------------------------------");

// Spawn Bun API Server
const server = spawn("bun", ["run", "--hot", "index.ts"], {
  cwd: "./server",
  stdio: "inherit",
  shell: true,
});

// Spawn Vite React Client
const client = spawn("bun", ["run", "dev"], {
  cwd: "./client",
  stdio: "inherit",
  shell: true,
});

// Handle termination signals to cleanly shut down both processes
process.on("SIGINT", () => {
  console.log("\n\x1b[31m%s\x1b[0m", "🛑 Stopping dev servers...");
  server.kill();
  client.kill();
  process.exit();
});

process.on("exit", () => {
  server.kill();
  client.kill();
});
