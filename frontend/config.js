(function () {
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "";
  window.MC_API =
    window.MC_API_OVERRIDE ||
    (isLocal ? "http://localhost:5000" : window.MC_API_LIVE || "");
})();
