export function setLoading(textId, spinnerId, loading) {
  const text = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  if (!text || !spinner) return;
  text.classList.toggle("hidden", !!loading);
  spinner.classList.toggle("hidden", !loading);
}

export function showFieldErr(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg || "";
}

export function clearFieldErr(id) {
  showFieldErr(id, "");
}
