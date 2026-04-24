document.addEventListener("DOMContentLoaded", async function () {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const authSection = document.getElementById("auth-section");
    const siteContent = document.getElementById("site-content");
    const siteHeader = document.getElementById("site-header");
    const siteFooter = document.getElementById("site-footer");

    document.body.classList.remove('initially-hidden');

    const currentUser = await getCurrentUser();

    if (currentUser) {
        const isAuthPage = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("register.html") || window.location.pathname === "/";
        if (isAuthPage && !new URLSearchParams(window.location.search).get("msg")) {
            if (currentUser.role === "admin") window.location.href = "admin.html";
            else showSiteContent();
        }
    } else { // Utente non loggato
        if (authSection) showAuthSection();
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value.trim();
            try {
                await loginUser(email, password);
                const user = await getCurrentUser();
                window.location.href = (user.role === "admin") ? "admin.html" : "products.html";
            } catch (err) {
                showAuthMessage("danger", err.message);
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("register-name").value.trim();
            const email = document.getElementById("register-email").value.trim();
            const password = document.getElementById("register-password").value.trim();
            const confirm = document.getElementById("register-confirm-password").value.trim();

            if (password !== confirm) {
                showAuthMessage("danger", "Le password non corrispondono.");
                return;
            }

            try {
                await registerUser({ name, email, password });
                await loginUser(email, password);
                window.location.href = "products.html";
            } catch (err) {
                showAuthMessage("danger", err.message);
            }
        });
    }

    // Funzioni helper sicure
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

    // Inizializzazione toggle password
    const list = [
        {btn: 'toggle-login-password', input: 'login-password'},
        {btn: 'toggle-register-password', input: 'register-password'},
        {btn: 'toggle-register-confirm-password', input: 'register-confirm-password'}
    ];
    list.forEach(t => {
        const b = document.getElementById(t.btn);
        if (b) b.onclick = () => togglePasswordVisibility(t.input, t.btn);
    });

    document.addEventListener("click", function (event) {
        if (event.target.id === "logout-link") {
            event.preventDefault();
            window.logout();
        }
        if (event.target.closest(".logout-link-global")) {
            event.preventDefault();
            window.logout();
        }
    });

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === 'Enter') window.searchProducts();
        });
    }
    const searchBtn = document.querySelector(".search-bar .btn");
    if (searchBtn) {
        searchBtn.onclick = () => window.searchProducts();
    };
});

function showAuthMessage(type, text) {
    const msg = document.getElementById("auth-message");
    if (msg) {
        msg.className = `alert alert-${type}`;
        msg.textContent = text;
        msg.style.display = "block";
    }
}

function togglePasswordVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;
    const icon = button.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
}