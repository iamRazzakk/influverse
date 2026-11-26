import type { Request } from "express";

/** "Chrome on Windows" — for the active sessions list in settings (no library, rough) */
export const deviceLabel = (ua = ""): string => {
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS";
  return `${browser} on ${os}`;
};

export type RequestMeta = { ip?: string; userAgent?: string; deviceLabel: string };

export const requestMeta = (req: Request): RequestMeta => {
  const userAgent = req.get("user-agent")?.slice(0, 300);
  return { ip: req.ip, userAgent, deviceLabel: deviceLabel(userAgent) };
};
