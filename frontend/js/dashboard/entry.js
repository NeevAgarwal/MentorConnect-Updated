import { startAuthEngine } from "../auth/auth-state.esm.js";
import { protectPage } from "../auth/guards.js";
import { initDashboard } from "./dashboard-core.js";

document.addEventListener("DOMContentLoaded", async () => {
  startAuthEngine();
  try {
    await protectPage();
  } catch {
    return;
  }
  initDashboard();
});
