declare module '*.mjs' {
  type LogMethod = (...args: any[]) => void;

  interface Logger {
    info: LogMethod;
    warn: LogMethod;
    error: LogMethod;
    debug: LogMethod;
    setLevel: (level: string) => void;
  }

  const log: Logger;

  export default log;
}