const isProd =
  typeof window !== "undefined" &&
  window.location &&
  !/localhost|127\.0\.0\.1/.test(window.location.hostname || "");

export const logger = {
  debug(...args) {
    if (!isProd) console.debug("[MC]", ...args);
  },
  info(...args) {
    if (!isProd) console.info("[MC]", ...args);
  },
  warn(...args) {
    console.warn("[MC]", ...args);
  },
  error(...args) {
    console.error("[MC]", ...args);
  },
};
