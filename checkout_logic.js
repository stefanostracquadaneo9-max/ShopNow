let stripe, card;

document.addEventListener('DOMContentLoaded', async () => {
    const rawItems = sessionStorage.getItem('shopnow-active-checkout');
    if (!rawItems) {
        window.location.href = 'cart.html';
        return;
    }
    const checkoutItems = JSON.parse(rawItems);
    await initCheckoutPage(checkoutItems);
});

async function initCheckoutPage(checkoutItems) {
    const products = typeof getAllProducts === 'function' ? getAllProducts() : [];
    const summaryContainer = document.getElementById('checkout-summary');
    let subtotal = 0;
    summaryContainer.innerHTML = '';

    Object.entries(checkoutItems).forEach(([id, qty]) => {
        const p = products.find(prod => String(prod.id) === id);
        if (p) {
            const lineTotal = p.price * qty;
            subtotal += lineTotal;
            summaryContainer.innerHTML += `
                <div class="d-flex justify-content-between mb-2">
                    <span>${p.name} (x${qty})</span>
                    <span>€${lineTotal.toFixed(2)}</span>
                </div>`;
        }
    });

    const vat = subtotal * 0.22;
    const total = subtotal + vat;
    document.getElementById('checkout-total-label').textContent = `€${total.toFixed(2)}`;

    const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
    if (user) {
        document.getElementById('checkout-name').value = user.name || '';
        document.getElementById('checkout-email').value = user.email || '';
        const addr = Array.isArray(user.addresses) ? user.addresses[0] : null;
        if (addr) {
            document.getElementById('checkout-address').value = addr.line1 || addr.street || '';
            document.getElementById('checkout-city').value = addr.city || '';
            document.getElementById('checkout-postal').value = addr.postalCode || '';
        }
    }

    const config = await fetch(getServerBaseUrl() + '/config').then(r => r.json());
    stripe = Stripe(config.stripePublicKey);
    const elements = stripe.elements();
    card = elements.create('card');
    card.mount('#card-element');

    document.getElementById('checkout-form').addEventListener('submit', handlePayment);
}

async function handlePayment(e) {
    e.preventDefault();
    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.textContent = 'Processando...';

    const name = document.getElementById('checkout-name').value;
    const email = document.getElementById('checkout-email').value;
    const totalText = document.getElementById('checkout-total-label').textContent.replace('€', '');
    const items = JSON.parse(sessionStorage.getItem('shopnow-active-checkout'));

    const intent = await fetch(getServerBaseUrl() + '/create-payment-intent', {
        method: 'POST',
        headers: typeof getAuthRequestHeaders === 'function' ? getAuthRequestHeaders({'Content-Type': 'application/json'}) : {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            amount: parseFloat(totalText), 
            customerName: name, 
            customerEmail: email,
            items: Object.entries(items).map(([id, qty]) => ({id, quantity: qty}))
        })
    }).then(r => r.json());

    const result = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: { card: card, billing_details: { name, email } }
    });

    if (result.error) {
        alert(result.error.message);
        btn.disabled = false;
        btn.textContent = 'Paga Ora';
    } else {
        const response = await fetch(getServerBaseUrl() + '/api/checkout', {
            method: 'POST',
            headers: typeof getAuthRequestHeaders === 'function' ? getAuthRequestHeaders({'Content-Type': 'application/json'}) : {'Content-Type': 'application/json'},
            body: JSON.stringify({
                paymentIntentId: result.paymentIntent.id,
                items: Object.entries(items).map(([id, qty]) => ({id, quantity: qty})),
                total: parseFloat(totalText),
                customerName: name,
                customerEmail: email,
                shippingAddress: { line1: document.getElementById('checkout-address').value }
            })
        });
        if (response.ok) {
            alert('Ordine completato con successo!');
            sessionStorage.removeItem('shopnow-active-checkout');
            if (typeof clearLocalCart === 'function') clearLocalCart();
            window.location.href = 'orders.html';
        } else {
            const err = await response.json();
            alert("Errore: " + err.error);
            btn.disabled = false;
            btn.textContent = 'Paga Ora';
        }
    }
}