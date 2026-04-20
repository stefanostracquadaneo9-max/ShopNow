/**
 * ShopNow - Professional Checkout Logic
 * Gestisce il pagamento Stripe e il riepilogo ordine in modo isolato.
 */
let stripe, card;

document.addEventListener('DOMContentLoaded', async () => {
    const rawData = sessionStorage.getItem('shopnow-active-checkout');
    if (!rawData) {
        window.location.href = 'cart.html';
        return;
    }
    const checkoutItems = JSON.parse(rawData);
    await initCheckout(checkoutItems);
});

async function initCheckout(items) {
    const products = typeof getAllProducts === 'function' ? getAllProducts() : [];
    const summaryEl = document.getElementById('checkout-summary');
    let subtotal = 0;

    summaryEl.innerHTML = '';
    Object.entries(items).forEach(([id, qty]) => {
        const product = products.find(p => String(p.id) === String(id));
        if (product) {
            const lineTotal = product.price * qty;
            subtotal += lineTotal;
            summaryEl.innerHTML += `
                <div class="d-flex justify-content-between mb-2">
                    <span>${product.name} (x${qty})</span>
                    <span>€${lineTotal.toFixed(2)}</span>
                </div>`;
        }
    });

    const total = subtotal + (subtotal * 0.22); // IVA
    document.getElementById('checkout-total-label').textContent = `€${total.toFixed(2)}`;

    // Pre-compilazione dati utente
    const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
    if (user) {
        document.getElementById('checkout-name').value = user.name || '';
        document.getElementById('checkout-email').value = user.email || '';
    }

    // Stripe Configuration
    const config = await fetch(getServerBaseUrl() + '/config').then(r => r.json());
    stripe = Stripe(config.stripePublicKey);
    card = stripe.elements().create('card');
    card.mount('#card-element');

    document.getElementById('checkout-form').addEventListener('submit', processPayment);
}

async function processPayment(e) {
    e.preventDefault();
    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.textContent = 'Processando...';

    const items = JSON.parse(sessionStorage.getItem('shopnow-active-checkout'));
    const total = document.getElementById('checkout-total-label').textContent.replace('€', '');

    try {
        // 1. Crea Intent sul server
        const intent = await fetch(getServerBaseUrl() + '/create-payment-intent', {
            method: 'POST',
            headers: getAuthRequestHeaders({'Content-Type': 'application/json'}),
            body: JSON.stringify({ 
                amount: parseFloat(total),
                items: Object.entries(items).map(([id, qty]) => ({id, quantity: qty}))
            })
        }).then(r => r.json());

        // 2. Conferma con Stripe
        const result = await stripe.confirmCardPayment(intent.clientSecret, {
            payment_method: { card: card }
        });

        if (result.error) throw new Error(result.error.message);

        // 3. Finalizza ordine
        await fetch(getServerBaseUrl() + '/api/checkout', {
            method: 'POST',
            headers: getAuthRequestHeaders({'Content-Type': 'application/json'}),
            body: JSON.stringify({ paymentIntentId: result.paymentIntent.id, items: items, total: total })
        });

        alert('Grazie! Ordine completato.');
        sessionStorage.removeItem('shopnow-active-checkout');
        window.location.href = 'orders.html';
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Paga Ora';
    }
}