let revChart;
let rateChart;

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;

  const role = state.mcUser?.role || localStorage.getItem("mc_role") || "student";
  if (role !== "mentor") {
    document.getElementById("analyticsGate")?.classList.remove("hidden");
    return;
  }

  document.getElementById("analyticsBody")?.classList.remove("hidden");
  const uid = state.firebaseUser.uid;
  const res = await mcGet(`/api/users/${uid}/analytics`);
  if (!res.ok) {
    document.getElementById("anCards").innerHTML = "<p>Could not load analytics</p>";
    return;
  }

  const a = res.data.analytics || {};
  document.getElementById("anCards").innerHTML = `
      <div class="stat-card"><div class="stat-num">${a.profileViews || 0}</div><div class="stat-label">Profile views</div></div>
      <div class="stat-card"><div class="stat-num">${a.totalSessions || 0}</div><div class="stat-label">Sessions completed</div></div>
      <div class="stat-card"><div class="stat-num">${a.earningsTotal || 0}</div><div class="stat-label">Earnings (tracked)</div></div>
      <div class="stat-card"><div class="stat-num">${(a.ratingAvg || 0).toFixed(1)}</div><div class="stat-label">Avg rating (${a.ratingCount || 0})</div></div>
      <div class="stat-card"><div class="stat-num">${a.upcomingConfirmed || 0}</div><div class="stat-label">Upcoming confirmed</div></div>
    `;

  const months = (a.revenueByMonth || []).map((r) => `${r._id.m}/${r._id.y}`);
  const revs = (a.revenueByMonth || []).map((r) => r.revenue || 0);
  const ctx1 = document.getElementById("revChart");
  if (revChart && ctx1) revChart.destroy();
  if (ctx1) {
    revChart = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: months.length ? months : ["-"],
        datasets: [{ label: "Revenue by month", data: revs.length ? revs : [0], backgroundColor: "rgba(212,175,55,0.45)" }],
      },
      options: { plugins: { legend: { labels: { color: "#ccc" } } }, scales: { x: { ticks: { color: "#888" } }, y: { ticks: { color: "#888" } } } },
    });
  }

  const dist = a.ratingDistribution || [];
  const labels = dist.map((d) => String(d._id) + " star");
  const counts = dist.map((d) => d.count || 0);
  const ctx2 = document.getElementById("rateChart");
  if (rateChart && ctx2) rateChart.destroy();
  if (ctx2) {
    rateChart = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["none"],
        datasets: [{ data: counts.length ? counts : [1], backgroundColor: ["#D4AF37", "#6ee7b7", "#60a5fa", "#f472b6", "#a78bfa"] }],
      },
      options: { plugins: { legend: { position: "bottom", labels: { color: "#ccc" } } } },
    });
  }

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    if (typeof clearAuthStorage === "function") clearAuthStorage();
    else if (typeof clearMcSession === "function") clearMcSession();
    await auth.signOut();
    location.href = "login.html";
  });

  document.getElementById("hamburger")?.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open"));
});
