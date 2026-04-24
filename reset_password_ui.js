function showMessage(type, text) {
    const msg = document.getElementById('reset-message');
    if (msg) {
        msg.className = `alert alert-${type}`;
        msg.textContent = text;
        msg.classList.remove('d-none');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.remove('initially-hidden');
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showMessage('danger', 'Token di reset mancante o non valido. Richiedi un nuovo link.');
        const form = document.getElementById('reset-password-form');
        if (form) form.classList.add('d-none');
    }

    const resetForm = document.getElementById('reset-password-form');
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password')?.value;
            const confirmPassword = document.getElementById('confirm-password')?.value;

            if (newPassword !== confirmPassword) {
                showMessage('danger', 'Le password non coincidono.');
                return;
            }

            try {
                const response = await fetch(`${window.SHOPNOW_API_BASE_URL}/api/auth/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword })
                });

                const data = await response.json();
                if (response.ok) {
                    showMessage('success', 'Password aggiornata con successo! Verrai reindirizzato al login tra pochi secondi...');
                    setTimeout(() => window.location.href = 'index.html', 3000);
                } else {
                    throw new Error(data.error || 'Errore durante il reset.');
                }
            } catch (error) {
                showMessage('danger', error.message);
            }
        });
    }

    const toggleVisibility = (inputId, btnId) => {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        if (input && btn) {
            btn.addEventListener('click', () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-eye', !isPassword);
                    icon.classList.toggle('fa-eye-slash', isPassword);
                }
            });
        }
    };

    toggleVisibility('new-password', 'toggle-new-password');
    toggleVisibility('confirm-password', 'toggle-confirm-password');
});