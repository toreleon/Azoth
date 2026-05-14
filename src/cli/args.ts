export function isVersionCommand(args: string[]): boolean {
  return args.length === 1 && ["--version", "-v", "version"].includes(args[0] ?? "");
}
