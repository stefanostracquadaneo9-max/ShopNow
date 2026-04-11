document.addEventListener("DOMContentLoaded", async function () {
    await initializeLocalDB();
    const authSection = document.getElementById("auth-section");
    const siteContent = document.getElementById("site-content");
    const siteHeader = document.getElementById("site-header");
    const siteFooter = document.getElementById("site-footer");
    const authMessage = document.getElementById("auth-message");
    const registerForm = document.getElementById("register-form");
    const currentUser = await getCurrentUser();
    if (currentUser) showSiteContent();
    else showAuthSection();
    if (registerForm)
        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearMessage();
            try {
                const name = document
                    .getElementById("register-name")
                    .value.trim();
                const email = document
                    .getElementById("register-email")
                    .value.trim()
                    .toLowerCase();
                const password = document
                    .getElementById("register-password")
                    .value.trim();
                const confirmPassword = document
                    .getElementById("register-confirm-password")
                    .value.trim();
                if (!name || !email || !password || !confirmPassword)
                    throw new Error("Compila tutti i campi.");
                if (password !== confirmPassword)
                    throw new Error("Le password non corrispondono.");
                await registerUser({
                    name: name,
                    email: email,
                    password: password,
                });
                await loginUser(email, password);
                showMessage("success", "Account creato con successo.");
                setTimeout(() => {
                    window.location.href = "products.html";
                }, 800);
            } catch (error) {
                showMessage(
                    "danger",
                    error.message || "Registrazione non riuscita.",
                );
            }
        });
    function showAuthSection() {
        if (authSection) authSection.style.display = "block";
        if (siteContent) siteContent.style.display = "none";
        if (siteHeader) siteHeader.style.display = "none";
        if (siteFooter) siteFooter.style.display = "none";
    }
    function showSiteContent() {
        if (authSection) authSection.style.display = "none";
        if (siteContent) siteContent.style.display = "block";
        if (siteHeader) siteHeader.style.display = "block";
        if (siteFooter) siteFooter.style.display = "block";
    }
    function showMessage(type, message) {
        if (!authMessage) return;
        authMessage.className = `alert alert-${type}`;
        authMessage.textContent = message;
        authMessage.style.display = "block";
    }
    function clearMessage() {
        if (!authMessage) return;
        authMessage.style.display = "none";
        authMessage.textContent = "";
    }
});
