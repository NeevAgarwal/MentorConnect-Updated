let toastTimer = null;

export function showToast(message, type = "success") {
  const existing = document.getElementById("mc-toast");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "mc-toast";
  el.className = "mc-toast" + (type === "error" ? " mc-toast--error" : type === "info" ? " mc-toast--info" : " mc-toast--success");
  el.setAttribute("role", "status");
  el.textContent = String(message || "");

  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("mc-toast--out");
    setTimeout(() => el.remove(), 280);
  }, 3200);
}
