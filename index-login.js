document.addEventListener("DOMContentLoaded", async function () {
    await initializeLocalDB();
    const authSection = document.getElementById("auth-section");
    const siteContent = document.getElementById("site-content");
    const siteHeader = document.getElementById("site-header");
    const siteFooter = document.getElementById("site-footer");
    const authMessage = document.getElementById("auth-message");
    const currentUser = await getCurrentUser();
    if (currentUser) {
        if (currentUser.role === "admin") {
            window.location.href = "admin.html";
        } else {
            showSiteContent();
        }
    } else {
        showAuthSection();
    }
    const loginForm = document.getElementById("login-form");
    if (loginForm)
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearMessage();
            try {
                const email = document
                    .getElementById("login-email")
                    .value.trim();
                const password = document
                    .getElementById("login-password")
                    .value.trim();
                await loginUser(email, password);
                const user = await getCurrentUser();
                if (user.role === "admin") window.location.href = "admin.html";
                else window.location.href = "products.html";
                showMessage(
                    "success",
                    "Accesso eseguito con successo. Benvenuto!",
                );
            } catch (error) {
                showMessage("danger", error.message);
            }
        });
    function showAuthSection() {
        authSection.style.display = "block";
        siteContent.style.display = "none";
        if (siteHeader) siteHeader.style.display = "none";
        if (siteFooter) siteFooter.style.display = "none";
    }
    function showSiteContent() {
        authSection.style.display = "none";
        siteContent.style.display = "block";
        if (siteHeader) siteHeader.style.display = "block";
        if (siteFooter) siteFooter.style.display = "block";
    }
    function showMessage(type, message) {
        authMessage.className = `alert alert-${type}`;
        authMessage.textContent = message;
        authMessage.style.display = "block";
        setTimeout(() => {
            authMessage.style.display = "none";
        }, 5e3);
    }
    function clearMessage() {
        authMessage.style.display = "none";
    }
    document.addEventListener("click", function (event) {
        if (event.target.id === "logout-link") {
            event.preventDefault();
            logout();
            showAuthSection();
            clearMessage();
        }
    });
});
