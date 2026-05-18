function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function toast(m, e) {
  const t = document.createElement("div");
  t.textContent = m;
  t.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;background:"+(e?"#3a1520":"#152a1a");color:"+(e?"#F87171":"#6ee7b7");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

async function loadAll() {
  if (localStorage.getItem("mc_admin") !== "1") {
    document.querySelector(".main-content").innerHTML = "<p style='padding:40px'>Access denied. Add your email to ADMIN_EMAILS in backend .env and re-register, or update isAdmin in MongoDB.</p>";
    return;
  }
  const [ov, users, bookings] = await Promise.all([
    mcGet("/api/admin/overview"),
    mcGet("/api/admin/users"),
    mcGet("/api/admin/bookings"),
  ]);
  if (!ov.ok) {
    toast(ov.error || "Forbidden", true);
    return;
  }
  const o = ov.data || {};
  const u = users.ok ? users.data.users || [] : [];
  const b = bookings.ok ? bookings.data.bookings || [] : [];
  document.getElementById("adminStats").innerHTML = `
    <div class="stat-card"><div class="stat-num">${o.analytics?.users || 0}</div><div class="stat-label">Users</div></div>
    <div class="stat-card"><div class="stat-num">${o.analytics?.mentors || 0}</div><div class="stat-label">Mentors</div></div>
    <div class="stat-card"><div class="stat-num">${o.analytics?.bookings || 0}</div><div class="stat-label">Bookings</div></div>
    <div class="stat-card"><div class="stat-num">${o.analytics?.revenueCompleted || 0}</div><div class="stat-label">Revenue (completed)</div></div>`;

  const userRows = u
    .map(
      (x) => `
    <tr>
      <td>${esc(x.name)}</td>
      <td>${esc(x.email)}</td>
      <td>${esc(x.role)}</td>
      <td>${x.banned ? "banned" : "ok"}</td>
      <td>${x.featured ? "★" : "—"}</td>
      <td>
        <button class="connect-btn outline" data-ban="${esc(x.firebaseUID)}" data-state="${x.banned ? 0 : 1}">${x.banned ? "Unban" : "Ban"}</button>
        ${x.role === "mentor" ? `<button class="connect-btn outline" data-feature="${esc(x.firebaseUID)}" data-f="${x.featured ? 0 : 1}">${x.featured ? "Unfeature" : "Feature"}</button>` : ""}
        <button class="connect-btn outline" data-del="${esc(x.firebaseUID)}">Delete</button>
      </td>
    </tr>`
    )
    .join("");
  document.getElementById("adminUsers").innerHTML = `<table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Featured</th><th></th></tr></thead><tbody>${userRows}</tbody></table>`;

  document.getElementById("adminBookings").innerHTML = `<table class="admin-table"><thead><tr><th>When</th><th>Status</th><th>Student</th><th>Mentor</th></tr></thead><tbody>${b
    .slice(0, 80)
    .map(
      (bk) => `<tr><td>${esc(new Date(bk.startTime).toLocaleString())}</td><td>${esc(bk.status)}</td><td>${esc(bk.studentFirebaseUID)}</td><td>${esc(bk.mentorFirebaseUID)}</td></tr>`
    )
    .join("")}</tbody></table>`;

  document.querySelectorAll("[data-ban]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.getAttribute("data-ban");
      const banned = btn.getAttribute("data-state") === "1";
      const res = await mcPatch("/api/admin/users/" + uid + "/ban", { banned });
      if (res.ok) toast("Updated");
      else toast(res.error || "Update failed", true);
      loadAll();
    });
  });
  document.querySelectorAll("[data-feature]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.getAttribute("data-feature");
      const featured = btn.getAttribute("data-f") === "1";
      const res = await mcPatch("/api/admin/users/" + uid + "/featured", { featured });
      if (res.ok) toast("Updated");
      else toast(res.error || "Update failed", true);
      loadAll();
    });
  });
  document.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete user from database?")) return;
      const uid = btn.getAttribute("data-del");
      const res = await mcDelete("/api/admin/users/" + uid);
      if (res.ok) toast("Deleted");
      else toast(res.error || "Delete failed", true);
      loadAll();
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;
  loadAll();
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    localStorage.removeItem("mc_jwt");
    await auth.signOut();
    location.href = "login.html";
  });
  document.getElementById("hamburger")?.addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
});
