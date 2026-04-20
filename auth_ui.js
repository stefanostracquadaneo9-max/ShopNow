document.addEventListener("DOMContentLoaded", async function () {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

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

const setupToggles = () => {
    const list = [
        {btn: 'toggle-login-password', input: 'login-password'},
        {btn: 'toggle-register-password', input: 'register-password'},
        {btn: 'toggle-register-confirm-password', input: 'register-confirm-password'}
    ];
    list.forEach(t => {
        const b = document.getElementById(t.btn);
        if (b) b.onclick = () => togglePasswordVisibility(t.input, t.btn);
    });
};
setupToggles();