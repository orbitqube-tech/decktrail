import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, extname, isAbsolute, join } from "node:path";

/**
 * Extensions worth trying when a bare command name is looked up on Windows.
 *
 * Deliberately narrower than PATHEXT. `.ps1` is on PATHEXT and is exactly what `opencode`
 * resolves to in PowerShell, and nothing can execute it as a process, so following PATHEXT would
 * pick the one file that cannot be run.
 */
const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];

/** The shim extensions Node refuses to execute without a shell. */
const WINDOWS_SHIM_EXTENSIONS = [".cmd", ".bat"];

/**
 * Find the file a bare command name actually refers to.
 *
 * Node does not do this for you on Windows, and the failure is badly misleading: a tool
 * installed globally through npm arrives as three files, `name`, `name.cmd` and `name.ps1`, and
 * only the first has no extension. Asked for `opencode`, Node looks for a file with exactly that
 * name, does not find one, and reports ENOENT as though the tool were not installed at all.
 *
 * Returns the original name unchanged when nothing is found, so the caller's "not found" message
 * still names what was asked for.
 */
export function resolveCommand(command: string, env: NodeJS.ProcessEnv = process.env): string {
  if (command.includes("/") || command.includes("\\") || isAbsolute(command)) return command;
  if (process.platform !== "win32" || extname(command) !== "") return command;

  for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of WINDOWS_EXECUTABLE_EXTENSIONS) {
      const candidate = join(dir, command + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}

/** Characters that cannot be quoted safely for the Windows command interpreter. */
const UNQUOTABLE = /["\r\n%]/;

/**
 * How long one model call may run before the child is killed.
 *
 * There was no timeout at all before this: a command-line tool that hung, waited on a prompt
 * that never came, or sat on a stalled network connection hung the whole `generate` with it,
 * with nothing on screen to say so. Ten minutes is deliberately generous, because a 25-slide
 * deck on a slow free model is minutes rather than seconds. It exists to bound a hung process,
 * not to police a slow one.
 */
export const DEFAULT_GENERATE_TIMEOUT_MS = 600_000;

export interface SpawnTextOptions {
  /** Kill the child after this many milliseconds. */
  timeoutMs?: number;
  /** Cancel from the caller, so a CLI can stop cleanly on an interrupt. */
  signal?: AbortSignal;
  /** Called with each chunk the child writes to stderr, so a caller can show progress. */
  onStderr?: (chunk: string) => void;
}

/**
 * Run a command, hand it `input` on **stdin**, and resolve with everything it wrote to stdout.
 *
 * The prompt goes in on stdin, never as an argument. Windows caps a command line at about 32 KB
 * and Linux at a couple of megabytes, so a long enough source document simply cannot be passed
 * as argv: four artifacts in the first real corpus were hundreds of kilobytes and hit that wall,
 * and the failure was an opaque spawn error that named nothing. Both supported providers were
 * checked against a real binary and both read a piped stdin.
 *
 * stdout and stderr are kept apart on purpose. Both CLIs write their progress chrome (the model
 * name, spinners, tool activity) to stderr and only the model's own text to stdout, so mixing
 * them would feed that chrome to the JSON parser.
 */
export function spawnText(
  command: string,
  args: readonly string[],
  input: string,
  opts: SpawnTextOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS;
  const resolved = resolveCommand(command);

  // Node refuses to execute a .cmd or .bat directly, and has since the batch-file argument
  // injection hardening: it fails with EINVAL rather than running it. A globally npm-installed
  // tool on Windows IS a .cmd, so the shell is not optional there. It is turned on only for
  // those two extensions, so a real executable keeps the direct, shell-free path.
  const needsShell = WINDOWS_SHIM_EXTENSIONS.includes(extname(resolved).toLowerCase());
  const unsafe = needsShell ? [resolved, ...args].find((a) => UNQUOTABLE.test(a)) : undefined;

  return new Promise((resolve, reject) => {
    if (unsafe !== undefined) {
      // The prompt itself never reaches the command line, so nothing an author writes can land
      // here. This can only trip on a configured binary path or model name, and refusing is the
      // right answer: quoting it for the Windows interpreter would be guesswork.
      reject(new Error(`"${unsafe}" cannot be passed safely to the Windows command interpreter`));
      return;
    }

    const child = needsShell
      ? spawn(`"${resolved}" ${args.map((a) => `"${a}"`).join(" ")}`, { stdio: ["pipe", "pipe", "pipe"], shell: true })
      : spawn(resolved, [...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() =>
        reject(
          new Error(
            `${command} did not finish within ${Math.round(timeoutMs / 1000)}s and was stopped. ` +
              `Raise the timeout, or pick a faster model.`,
          ),
        ),
      );
    }, timeoutMs);

    const onAbort = (): void => {
      child.kill();
      finish(() => reject(new Error(`${command} was cancelled`)));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      const chunk = d.toString();
      err += chunk;
      opts.onStderr?.(chunk);
    });

    // A missing binary is the single most likely first-run failure, and Node reports it as a
    // bare ENOENT that names neither the command nor what to do about it. Say both.
    child.on("error", (e: NodeJS.ErrnoException) =>
      finish(() =>
        reject(
          e.code === "ENOENT"
            ? new Error(`the "${command}" command was not found. Install it, or point at it with its own setting.`)
            : e,
        ),
      ),
    );

    child.on("close", (code) =>
      finish(() =>
        code === 0 ? resolve(out) : reject(new Error(err.trim() || `${command} exited with code ${code}`)),
      ),
    );

    // A broken pipe here means the child died before reading; the close handler reports why.
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
