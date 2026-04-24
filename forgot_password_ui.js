document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.remove('initially-hidden');

    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('forgot-email');
            const email = emailInput ? emailInput.value.trim() : '';
            const submitBtn = document.getElementById('submit-btn');
            const messageBox = document.getElementById('forgot-message');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Invio...';
            }
            
            try {
                const response = await fetch(`${window.SHOPNOW_API_BASE_URL}/api/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                
                if (messageBox) {
                    messageBox.className = 'alert alert-success';
                    messageBox.textContent = data.message || 'Se l\'email è presente nei nostri sistemi, riceverai a breve un link di reset.';
                    messageBox.classList.remove('d-none');
                }
                forgotForm.classList.add('d-none');
            } catch (error) {
                if (messageBox) {
                    messageBox.className = 'alert alert-danger';
                    messageBox.textContent = 'Errore di connessione. Riprova più tardi.';
                    messageBox.classList.remove('d-none');
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Invia istruzioni di reset';
                }
            }
        });
    }
});