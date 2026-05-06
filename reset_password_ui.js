function showMessage(type, text) {
  const msg = document.getElementById("reset-message");
  if (!msg) return;
  msg.className = `alert alert-${type}`;
  msg.textContent = text;
  msg.classList.remove("d-none");
}

function getResetApiUrl(path) {
  if (typeof getAuthApiUrl === "function") return getAuthApiUrl(path);
  if (typeof window.getApiUrl === "function") return window.getApiUrl(path);
  const baseUrl = window.SHOPNOW_API_BASE_URL || window.location.origin;
  return `${baseUrl}${path}`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.remove("initially-hidden");
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  const resetForm = document.getElementById("reset-password-form");

  if (!token) {
    showMessage(
      "danger",
      "Token di reset mancante o non valido. Richiedi un nuovo link.",
    );
    resetForm?.classList.add("d-none");
  }

  resetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = resetForm.querySelector('button[type="submit"]');
    const newPassword = document.getElementById("new-password")?.value || "";
    const confirmPassword =
      document.getElementById("confirm-password")?.value || "";

    if (!newPassword || !confirmPassword) {
      showMessage("danger", "Inserisci e conferma la nuova password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("danger", "Le password non coincidono.");
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Aggiornamento...";
      }
      const response = await fetch(getResetApiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Errore durante il reset.");
      }
      showMessage(
        "success",
        "Password aggiornata con successo. Verrai reindirizzato al login tra pochi secondi...",
      );
      setTimeout(() => {
        window.location.href = "index.html";
      }, 3000);
    } catch (error) {
      showMessage("danger", error.message);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Aggiorna Password";
      }
    }
  });

  const toggleVisibility = (inputId, buttonId) => {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;
    button.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      const icon = button.querySelector("i");
      icon?.classList.toggle("fa-eye", !isPassword);
      icon?.classList.toggle("fa-eye-slash", isPassword);
    });
  };

  toggleVisibility("new-password", "toggle-new-password");
  toggleVisibility("confirm-password", "toggle-confirm-password");
});
