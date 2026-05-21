// ================================================================
//  IdeaSphere index-auth.js
//  Handles auth state on the homepage:
//  - Shows user name + logout if logged in
//  - Shows Login / Signup buttons if logged out
// ================================================================

async function updateIndexAuthState() {
  await initAuthState();
  const state = getAuthState();
  const authButtons = document.getElementById("navAuthButtons");
  const userMenu = document.getElementById("navUserMenu");
  const userName = document.getElementById("navUserName");

  if (state.firebaseUser) {
    const displayName = state.firebaseUser.displayName || (state.firebaseUser.email ? state.firebaseUser.email.split("@")[0] : "User");
    if (userName) userName.textContent = `Hi, ${displayName}`;
    if (authButtons) authButtons.style.display = "none";
    if (userMenu) userMenu.style.display = "flex";
  } else {
    if (authButtons) authButtons.style.display = "flex";
    if (userMenu) userMenu.style.display = "none";
  }
}

updateIndexAuthState().catch((err) => console.error("Failed to initialize index auth state:", err));

// Logout
function handleLogout() {
  if (typeof clearAuthStorage === "function") clearAuthStorage();
  else if (typeof clearMcSession === "function") clearMcSession();
  auth
    .signOut()
    .then(() => {
      window.location.reload();
    })
    .catch(err => {
      console.error("Logout error:", err);
    });
}
