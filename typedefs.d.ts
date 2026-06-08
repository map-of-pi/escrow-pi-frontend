import type { PiType } from "./src/config/pi";

declare global {
  interface Window {
    Pi?: PiType;
  }

  const Pi: PiType;
}

export {};
