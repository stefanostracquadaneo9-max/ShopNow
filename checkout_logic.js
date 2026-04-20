/**
 * ShopNow - Professional Checkout Logic
 * Gestisce il pagamento Stripe e il riepilogo ordine in modo isolato.
 */
let stripe, card, selectedAddressId = null, selectedPaymentId = null;
let profileData = null;

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

    const total = subtotal + (subtotal * 0.22);
    document.getElementById('checkout-total-label').textContent = `€${total.toFixed(2)}`;

    // Carica Profilo per indirizzi e carte
    try {
        const resp = await fetch(getServerBaseUrl() + '/api/profile', { headers: getAuthRequestHeaders() });
        profileData = await resp.json();
        renderSavedAddresses();
        renderSavedPayments();
    } catch(e) { console.error("Errore profilo", e); }

    initStripe();
    document.getElementById('checkout-btn').onclick = processPayment;
}

function renderSavedAddresses() {
    const container = document.getElementById('saved-addresses-list');
    if (!profileData?.addresses?.length) { showNewAddressForm(); return; }
    container.innerHTML = profileData.addresses.map(a => `
        <div class="selection-card ${a.isDefault ? 'selected' : ''}" onclick="selectAddress(${a.id}, this)">
            <div class="fw-bold">${profileData.name}</div>
            <div>${a.line1}, ${a.city}, ${a.postalCode}</div>
        </div>
    `).join('');
    if (profileData.addresses[0]) selectAddress(profileData.addresses[0].id);
}

window.selectAddress = (id, el) => {
    selectedAddressId = id;
    if (el) {
        document.querySelectorAll('#saved-addresses-list .selection-card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
    }
};

window.showNewAddressForm = () => {
    document.getElementById('new-address-form').style.display = 'block';
    selectedAddressId = 'new';
};

async function initStripe() {
    const config = await fetch(getServerBaseUrl() + '/config').then(r => r.json());
    stripe = Stripe(config.stripePublicKey);
    card = stripe.elements().create('card');
    card.mount('#card-element');
}

async function processPayment(e) {
    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.textContent = 'Processando...';

    const items = JSON.parse(sessionStorage.getItem('shopnow-active-checkout'));
    const total = document.getElementById('checkout-total-label').textContent.replace('€', '');
    
    let shippingAddress = null;
    if (selectedAddressId === 'new') {
        shippingAddress = {
            line1: document.getElementById('new-addr-street').value,
            city: document.getElementById('new-addr-city').value,
            postalCode: document.getElementById('new-addr-zip').value,
            country: document.getElementById('new-addr-country').value
        };
    } else {
        const a = profileData.addresses.find(addr => addr.id === selectedAddressId);
        shippingAddress = { line1: a.line1, city: a.city, postalCode: a.postalCode, country: a.country };
    }

    try {
        const intent = await fetch(getServerBaseUrl() + '/create-payment-intent', {
            method: 'POST',
            headers: getAuthRequestHeaders({'Content-Type': 'application/json'}),
            body: JSON.stringify({ 
                amount: parseFloat(total),
                customerName: profileData.name,
                customerEmail: profileData.email,
                items: Object.entries(items).map(([id, qty]) => ({id, quantity: Number(qty)}))
            })
        }).then(r => r.json());

        const result = await stripe.confirmCardPayment(intent.clientSecret, {
            payment_method: { card: card }
        });

        if (result.error) throw new Error(result.error.message);

        const checkoutResp = await fetch(getServerBaseUrl() + '/api/checkout', {
            method: 'POST',
            headers: getAuthRequestHeaders({'Content-Type': 'application/json'}),
            body: JSON.stringify({ 
                paymentIntentId: result.paymentIntent.id, 
                items: Object.entries(items).map(([id, qty]) => ({id, quantity: Number(qty)})),
                total: parseFloat(total),
                customerName: profileData.name,
                customerEmail: profileData.email,
                shippingAddress: shippingAddress
            })
        });
        if (!checkoutResp.ok) throw new Error("Errore salvataggio ordine");

        alert('Grazie! Ordine completato.');
        sessionStorage.removeItem('shopnow-active-checkout');
        window.location.href = 'orders.html';
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Paga Ora';
    }
}