<?php
return [
    'db' => [
        'host' => 'sqlXXX.infinityfree.com',
        'name' => 'if0_XXXXXXXX_shopnow',
        'user' => 'if0_XXXXXXXX',
        'pass' => 'PASSWORD_DATABASE',
    ],
    'stripe' => [
        'public_key' => 'pk_test_xxx',
        'secret_key' => 'sk_test_xxx',
    ],
    'email' => [
        'host' => 'smtp.gmail.com',
        'port' => 587,
        'secure' => false,
        'user' => 'tuaemail@gmail.com',
        'pass' => 'PASSWORD_APP_GOOGLE',
        'from' => 'tuaemail@gmail.com',
        'from_name' => 'ShopNow',
    ],
    'site' => [
        'public_url' => 'https://tuodominio.infinityfreeapp.com',
    ],
    'security' => [
        'install_token' => 'CAMBIA_QUESTO_TOKEN_LUNGO',
    ],
    'admin' => [
        'email' => 'admin@gmail.com',
        'name' => 'Administrator',
        'password' => 'admin',
    ],
];
