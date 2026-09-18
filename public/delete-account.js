/* Google ID and Fala session tokens are held in memory only, never in URLs or browser storage. */
let session = "";
let challenge;
let busy = false;
const el = id => document.getElementById(id);
const message = text => { el("status").textContent = text; };
async function api(path, method = "POST", body = {}) {
  const response = await fetch(path, { method, redirect: "error", credentials: "omit", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) session = "";
    throw new Error(response.status >= 500 ? "Fala sign-in is temporarily unavailable. Please try again or email support." : result.detail || "Please try again or email support.");
  }
  return result;
}
async function begin() {
  if (busy) return;
  busy = true;
  el("retry").hidden = true; el("confirmation").hidden = true;
  el("google-sign-in").hidden = false; el("google-sign-in").replaceChildren();
  try {
    if (!window.google?.accounts?.id) throw new Error("Google sign-in could not load. Please check your connection and try again, or email support.");
    challenge = await api("/auth/google/challenge");
    window.google.accounts.id.initialize({ client_id: challenge.google_client_id, nonce: challenge.nonce,
      auto_select: false, callback: signedIn });
    window.google.accounts.id.renderButton(el("google-sign-in"), { theme: "outline", size: "large", text: "signin_with" });
    message("Choose the Google account you use in Fala.");
  } catch (error) { message(error.message); el("retry").hidden = false; }
  finally { busy = false; }
}
async function signedIn(result) {
  if (busy) return;
  busy = true;
  try {
    const account = await api("/auth/google", "POST", { challenge_id: challenge.challenge_id, id_token: result.credential });
    session = account.token;
    el("account").textContent = `Signed in as ${account.email}`;
    el("google-sign-in").hidden = true; el("confirmation").hidden = false;
    el("confirm").checked = false; el("delete").disabled = true;
    message("Confirm below to delete your Fala account.");
  } catch (error) { message(error.message); el("retry").hidden = false; }
  finally { busy = false; }
}
el("confirm").addEventListener("change", () => { el("delete").disabled = !el("confirm").checked || busy; });
el("delete").addEventListener("click", async () => {
  if (!session || busy || !el("confirm").checked) return;
  busy = true; el("delete").disabled = true; el("cancel").disabled = true;
  try {
    await api("/account", "DELETE"); session = "";
    window.google?.accounts?.id.disableAutoSelect(); el("confirmation").hidden = true;
    message("Your Fala account and learning data have been deleted.");
  } catch (error) {
    message(error.message);
    if (!session) { el("confirmation").hidden = true; el("retry").hidden = false; }
  } finally { busy = false; el("delete").disabled = !el("confirm").checked; el("cancel").disabled = false; }
});
el("cancel").addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try { await api("/auth/logout"); } catch { /* Always discard the local session. */ }
  finally {
    session = ""; busy = false; window.google?.accounts?.id.disableAutoSelect();
    el("confirmation").hidden = true; el("retry").hidden = false; message("Signed out. Your account has not been deleted.");
  }
});
el("retry").addEventListener("click", begin);
window.addEventListener("load", begin);
