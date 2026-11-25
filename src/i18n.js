'use strict';
// Bilingual dictionary (EN/ES).
//  - Public storefront: defaults to English; customer can switch with a toggle
//    (saved in the `site_lang` cookie).
//  - Admin panel: defaults to Spanish; admin can switch (saved in `panel_lang`).
// t(key, vars) does {placeholder} interpolation.

const dict = {
  en: {
    // ---------- shared ----------
    'col.order': 'Order', 'col.service': 'Service', 'col.customer': 'Customer',
    'col.price': 'Price', 'col.provider': 'Provider', 'col.status': 'Status',
    'col.time': 'Time', 'col.imeiSerial': 'IMEI/Serial', 'col.user': 'User',
    'col.balance': 'Balance', 'col.joined': 'Joined', 'col.date': 'Date',
    'col.type': 'Type', 'col.amount': 'Amount', 'col.ref': 'Ref',
    'col.network': 'Network', 'col.tx': 'TX', 'col.topup': 'Top-up',
    'btn.open': 'Open', 'btn.save': 'Save', 'btn.create': 'Create',
    'btn.apply': 'Apply', 'btn.change': 'Change', 'btn.view': 'View',
    'btn.pay': 'Pay', 'btn.copy': 'Copy',
    'common.optional': 'Optional', 'common.active': 'active', 'common.noApi': 'no API',
    'status.active': 'Active', 'status.disabled': 'Disabled',
    'status.pending': 'Pending', 'status.approved': 'Approved', 'col.approval': 'Approval',
    'label.serial': 'Serial', 'label.imei': 'IMEI',
    'field.name': 'Name', 'field.email': 'Email', 'field.password': 'Password',
    'nav.language': 'Language',
    // order status (singular, customer-facing)
    'ostatus.queued': 'Processing', 'ostatus.processing': 'Processing',
    'ostatus.completed': 'Completed', 'ostatus.rejected': 'Rejected', 'ostatus.cancelled': 'Cancelled',
    // topup status
    'tstatus.pending': 'Pending', 'tstatus.confirmed': 'Confirmed', 'tstatus.expired': 'Expired',
    'tstatus.awaiting': 'Awaiting payment',
    // ledger types
    'ltype.topup': 'Top-up', 'ltype.order': 'Purchase', 'ltype.refund': 'Refund',
    'ltype.admin_credit': 'Adjustment +', 'ltype.admin_debit': 'Adjustment −',
    'ltype.admin_payment': 'Payment', 'ltype.admin_gift': 'Gift',

    // ---------- public site chrome ----------
    'site.services': 'Services', 'site.howItWorks': 'How it works',
    'site.dashboard': 'Dashboard', 'site.addFunds': 'Add funds',
    'site.myAccount': 'My account', 'site.logout': 'Log out',
    'site.login': 'Log in', 'site.signup': 'Sign up',
    'site.metaDesc': 'Unlock services: FMI OFF, MDM bypass and network unlock. Secure payment with USDT.',
    'footer.tagline': 'Unlock and software services. Payments in USDT (TRC20 / ERC20).',
    'footer.rights': 'All rights reserved.',

    // ---------- home ----------
    'home.h1': 'Fast and secure <span class="grad">unlocks</span><br>for your iPhone and iPad',
    'home.sub': 'FMI OFF, MDM bypass and network unlock with a 100% success rate. Order in minutes and pay securely with USDT.',
    'home.badge1': '⚡ <strong>Fast delivery</strong>',
    'home.badge2': '🔒 Pay with <strong>USDT (TRC20 / ERC20)</strong>',
    'home.badge3': '✅ <strong>100%</strong> success',
    'home.badge4': '🤖 <strong>Automatic</strong> process',
    'home.noServices': "No services loaded yet. If you're the admin, sync the catalog from the dashboard.",
    'home.orderNow': 'Order now',
    'badge.serial': '# Serial',

    // ---------- how it works ----------
    'how.step1t': 'Choose your service', 'how.step1d': 'Pick the model or unlock type you need.',
    'how.step2t': 'Enter your IMEI or Serial', 'how.step2d': 'Dial *#06# or find it in Settings → General → About.',
    'how.step3t': 'Pay with USDT', 'how.step3d': 'Send the exact amount via TRC20 or ERC20. It confirms automatically in minutes.',
    'how.step4t': 'Get your result', 'how.step4d': "We process your order and you'll see the result in your account.",
    'how.faq': 'Frequently asked questions',
    'how.q1': 'What is USDT?',
    'how.a1': "It's a stablecoin pegged to the US dollar (1 USDT ≈ 1 USD). You can buy it on Binance, Kraken or any exchange and pay from your wallet.",
    'how.q2': 'Which network should I choose, TRC20 or ERC20?',
    'how.a2': 'TRC20 (TRON) has lower fees and is the most used. ERC20 (Ethereum) also works. Always send on the network you selected.',
    'how.q3': 'How long does it take?',
    'how.a3': 'It depends on the service: from instant up to 24 hours. The estimated time is shown on each service.',

    // ---------- login ----------
    'login.sub': 'Sign in to view your orders and place new ones.',
    'login.noAccount': "Don't have an account?",
    'login.errBadCreds': 'Incorrect email or password',
    'login.errDisabled': 'Your account is disabled. Contact support.',

    // ---------- register ----------
    'reg.title': 'Create account',
    'reg.sub': 'Free. Required to order and track your unlocks.',
    'reg.passwordHint': 'At least 6 characters.',
    'reg.haveAccount': 'Already have an account?',

    // ---------- otp ----------
    'otp.title': 'Verification',
    'otp.sentA': 'We sent a 6-digit code to', 'otp.sentB': "It's valid for", 'otp.minutes': 'minutes',
    'otp.trust': "Trust this device (don't ask for a code here)",
    'otp.verify': 'Verify', 'otp.resend': 'Resend code', 'otp.wait': 'wait',
    'otp.errExpired': 'The code expired. Request a new one.',
    'otp.errBlocked': 'Too many attempts. Request a new code.',
    'otp.errWrong': 'Incorrect code.', 'otp.errInvalid': 'Invalid code.',

    // ---------- account ----------
    'acct.hi': 'Hi', 'acct.yourBalance': 'your balance', 'acct.shop': 'Shop',
    'acct.myOrders': 'My orders',
    'acct.noOrders': "You don't have any orders yet.", 'acct.browse': 'Browse services →',
    'acct.noTopups': 'No top-ups yet.',

    // ---------- service ----------
    'svc.back': '← Back to services',
    'svc.serialRequired': 'Serial required', 'svc.imeiRequired': 'IMEI required',
    'svc.automatic': '⚡ Automatic',
    'svc.loginToOrder': "Log in to order. It's free.",
    'svc.noAccount': "Don't have an account?", 'svc.createHere': 'Create one here',
    'svc.yourBalance': 'Your balance',
    'svc.insufficient': 'Insufficient balance. You need ${amt} more.',
    'svc.addFunds': 'Add funds',
    'svc.deviceSerial': 'Device serial number', 'svc.deviceImei': 'Device IMEI',
    'svc.hintSerial': 'In Settings → General → About, or on the box.',
    'svc.hintImei': 'Dial <strong>*#06#</strong> or find it in Settings → General → About.',
    'svc.orderDeduct': 'Order now · −${amt} from balance',
    'svc.step1serial': '1. Enter your serial', 'svc.step1imei': '1. Enter your IMEI',
    'svc.step2': '2. Charged from your balance', 'svc.step3': '3. We process your order',
    'svc.step4': '4. You get the result',
    'svc.refundNote': "If it can't be completed for any reason, your <strong>balance is refunded</strong> automatically.",

    // ---------- order (customer) ----------
    'ordr.back': '← My orders', 'ordr.completed': '✅ Order completed!',
    'ordr.result': 'Result:', 'ordr.resultDefault': 'Processed successfully. Check your device.',
    'ordr.rejected': "Couldn't be completed. We refunded <strong>${amt}</strong> to your balance.",
    'ordr.tryAgain': 'Try again', 'ordr.processing': 'Processing your order…',
    'ordr.processingNote': "We'll notify you by email and here when it's ready. You don't need to do anything else.",
    'ordr.summary': 'Summary', 'ordr.resolvedIn': 'Resolved in',

    // ---------- topup ----------
    'top.currentBalance': 'Your current balance', 'top.addFunds': 'Add funds',
    'top.sub': "Top up with USDT and it's instantly available for your orders.",
    'top.notAvailable': "Top-ups aren't available yet. Check back soon.",
    'top.amountLabel': 'Amount to add (USDT)', 'top.minPh': 'Minimum {min}',
    'top.minHint': 'Minimum {min} USDT.', 'top.tronLowFee': 'TRON · low fee',
    'top.continue': 'Continue →',

    // ---------- topup pay ----------
    'pay.back': '← My account',
    'pay.netTron': 'USDT · TRON network (TRC20)', 'pay.netEth': 'USDT · Ethereum network (ERC20)',
    'pay.instr': 'Send <strong>exactly</strong> the amount below to the address shown, on the correct network. It\'s credited automatically in 1-3 minutes.',
    'pay.exactAmount': 'Exact amount to send',
    'pay.exactHint': "⚠️ Send the exact amount (including cents). That's how we identify your top-up automatically.",
    'pay.onlyUsdt': 'Only <strong>USDT</strong> on this network. Another network or coin = loss of funds.',
    'pay.address': 'Address', 'pay.scan': 'Scan to pay', 'pay.waiting': 'Waiting for your payment…',
    'pay.creditedA': '✅ Top-up credited. Current balance:', 'pay.goShopping': 'Go shopping',
    'pay.expired': '⌛ This top-up expired without receiving payment.',
    'pay.createNew': 'Create a new top-up', 'pay.currentBalance': 'Current balance',

    // ---------- category ----------
    'cat.all': '← All services', 'cat.soon': "We'll add services to this category soon.",

    // ---------- error pages / route messages ----------
    'err.backHome': 'Back to home',
    'err.notFound': 'Not found', 'err.unavailable': 'Unavailable',
    'err.categoryNotFound': 'Category not found.', 'err.serviceUnavailable': 'Service unavailable.',
    'err.orderNotFound': 'Order not found.', 'err.topupNotFound': 'Top-up not found.',
    'err.accountDisabled': 'Account disabled', 'err.accountDisabledMsg': 'Your account is disabled. Contact support.',
    'err.accessDenied': 'Access denied', 'err.adminsOnly': 'Admins only.',
    'ordr.invalidImei': 'Invalid IMEI. It must be 14 to 16 digits (dial *#06#).',
    'ordr.invalidSerial': 'Invalid serial number (6 to 20 characters).',
    'ordr.insufficientMsg': 'Insufficient balance. Your balance is {bal} USDT and the service costs {price}. Add funds to continue.',
    'ordr.chargeFail': 'Could not charge your balance. Please try again.',
    'top.chooseNetwork': 'Choose a valid network.',
    'top.minMsg': 'The minimum top-up is {min} USDT.', 'top.tooHigh': 'Amount too high.',
    // auth errors (thrown as keys)
    'auth.invalidEmail': 'Invalid email',
    'auth.passwordMin': 'Password must be at least 6 characters',
    'auth.emailExists': 'An account with that email already exists',
    // approval gate (public)
    'gate.cardGuest': '🔒 Log in to see prices', 'gate.cardPending': '🔒 Pending approval',
    'gate.pendingBanner': "Your account is pending approval. You'll be able to see prices, add funds and order once we approve it.",
    'gate.serviceGuest': 'Log in to see the price and order. It is free.',
    'gate.servicePending': "Your account is pending approval. You'll be able to order once we approve it.",
    'gate.topupPending': 'Your account is pending approval. You can add funds once we approve it.',
    'gate.notApproved': 'Your account is pending approval.',

    // ---------- admin nav ----------
    'nav.overview': '📊 Overview', 'nav.orders': '🧾 Orders', 'nav.services': '🛠 Services',
    'nav.users': '👥 Users', 'nav.topups': '💰 Top-ups', 'nav.account': '⚙ My account', 'nav.viewStore': '↗ View store',

    // ---------- admin dashboard ----------
    'dash.title': 'Overview', 'dash.orders': 'Orders', 'dash.queuedManual': 'Queued (manual)',
    'dash.processing': 'Processing', 'dash.completed': 'Completed', 'dash.rejected': 'Rejected',
    'dash.completedSales': 'Completed sales', 'dash.customers': 'Customers',
    'dash.pendingTopups': 'Pending top-ups', 'dash.providers': 'Providers',
    'dash.noProviders': 'No providers configured. Add them in .env (PROVIDER_1_*, PROVIDER_2_* blocks).',
    'dash.latestOrders': 'Latest orders', 'dash.noOrders': 'No orders yet.',

    // ---------- admin orders ----------
    'orders.title': 'Orders', 'filter.all': 'All', 'filter.queued': 'Queued',
    'filter.processing': 'Processing', 'filter.completed': 'Completed', 'filter.rejected': 'Rejected',
    'orders.noneFilter': 'No orders in this filter.', 'tag.refund': 'refund',

    // ---------- admin order detail ----------
    'order.allOrders': '← All orders', 'order.title': 'Order',
    'order.chargedBalance': 'Charged from balance', 'order.refunded': 'refunded',
    'order.mode': 'Mode', 'order.modeAutomatic': 'Automatic', 'order.modeManual': 'Manual',
    'order.currentProvider': 'Current provider', 'order.totalTime': 'Total time (customer)',
    'order.created': 'Created', 'order.deliveredResult': 'Delivered result:',
    'order.providerAttempts': 'Provider attempts', 'order.noAttempts': 'No automatic attempts (manual order).',
    'attempt.sent': 'sent (in progress)', 'attempt.success': '✅ resolved',
    'attempt.rejected': '⛔ rejected', 'attempt.error': '⚠️ error',
    'attempt.cost': 'cost', 'attempt.took': 'took',
    'order.process': 'Process', 'order.resultForCustomer': 'Result / code for the customer',
    'order.resultPlaceholder': 'e.g. Unlock completed. Code: 1234-5678',
    'order.markCompleted': '✅ Mark completed & notify',
    'order.sendProvider': '🤖 Send to provider (auto, cheapest)',
    'order.confirmReject': 'Reject and refund the balance to the customer?',
    'order.rejectRefund': '⛔ Reject & refund',

    // ---------- admin services ----------
    'services.title': 'Services', 'services.sync': '🔄 Sync',
    'services.globalMarkup': 'Global markup:', 'services.editIn': 'edit it in',
    'services.importedOff': 'Imported services arrive off: turn them on when you want to sell them. Customers never see providers or costs.',
    'services.salePrice': 'sale price', 'services.effectiveCost': 'effective cost',
    'services.visible': 'Visible', 'services.automatic': '⚡ Automatic',
    'opt.globalMarkup': 'global markup', 'opt.fixedDollar': 'fixed $',
    'opt.providerCheapest': 'Provider: cheapest', 'opt.fixed': 'Fixed:',
    'services.sources': 'Sources (providers that supply it):', 'services.cost': 'cost',
    'services.serviceId': 'Service ID', 'services.addSource': '+ source',
    'services.none': 'No services. Sync from a provider or wait for the catalog to load.',

    // ---------- admin users ----------
    'users.title': 'Users', 'users.create': 'Create user',
    'users.createHint': 'Useful when a customer prefers you create the account. Share these details and they can change their password later.',
    'users.autoApproveTitle': 'New-user approval',
    'users.autoApproveOn': '🟢 Auto-approve: ON — new users can see prices and buy right away',
    'users.autoApproveOff': '🔒 Auto-approve: OFF — you approve each new user before they can buy',
    'users.autoApproveTurnOn': 'Turn ON auto-approve',
    'users.autoApproveTurnOff': 'Turn OFF (require my approval)',
    'user.approve': '✅ Approve', 'user.unapprove': '⛔ Remove approval',
    'user.approvalPending': 'Pending — cannot see prices or buy yet',

    // ---------- admin user detail ----------
    'user.allUsers': '← All users', 'user.newPassword1': 'New password for',
    'user.newPassword2': "— copy it and send it to the customer (it won't be shown again).",
    'user.noName': 'No name', 'user.joined': 'joined', 'user.status': 'Status',
    'role.administrator': 'Administrator', 'user.orders': 'Orders', 'user.noOrders': 'No orders.',
    'user.balanceHistory': 'Balance history', 'user.noActivity': 'No activity.',
    'user.actions': 'Actions', 'user.disableBan': '🚫 Disable (ban)', 'user.activate': '✅ Activate',
    'user.adjustBalance': 'Adjust balance (+ add, − subtract)', 'user.adjustPlaceholder': 'e.g. 50 or -10',
    'user.notePlaceholder': 'Note (optional)', 'user.confirmPassword': 'Change the password for this user?',
    'user.resetPassword': 'Reset password', 'user.newBlankGenerate': 'New (blank = generate)',
    'user.resetHint': 'If you leave it blank, a secure one is generated and shown so you can send it.',
    'user.lifetimeRecharged': 'Lifetime recharged', 'user.lifetimeGifts': 'Gifts given',
    'user.servicesPurchased': 'Services purchased', 'user.totalSpent': 'Total spent',
    'user.reasonLabel': 'Reason', 'user.reasonPayment': 'Payment (other method)',
    'user.reasonGift': 'Gift balance', 'user.reasonCorrection': 'Correction / remove',
    'user.dangerZone': 'Danger zone', 'user.deleteUser': '🗑 Delete user',
    'user.deleteHint': 'Permanent: removes the customer and all their orders, top-ups and balance history.',
    'user.confirmDelete': 'Delete this user permanently? This erases their orders, top-ups and balance history. It cannot be undone.',

    // ---------- admin topups ----------
    'topups.title': 'Top-ups', 'topups.none': 'No top-ups.',

    // ---------- admin: my account (change own password) ----------
    'acctAdmin.title': 'My account', 'acctAdmin.changePassword': 'Change my password',
    'acctAdmin.current': 'Current password', 'acctAdmin.new': 'New password',
    'acctAdmin.confirm': 'Confirm new password', 'acctAdmin.save': 'Change password',
    'acctAdmin.hint': 'This is the password you use to log into your panel.',
    'acctAdmin.ok': 'Password changed.',
    'acctAdmin.errCurrent': 'Current password is incorrect.',
    'acctAdmin.errMin': 'New password must be at least 6 characters.',
    'acctAdmin.errMatch': 'The new passwords do not match.',
  },

  es: {
    // ---------- shared ----------
    'col.order': 'Pedido', 'col.service': 'Servicio', 'col.customer': 'Cliente',
    'col.price': 'Precio', 'col.provider': 'Proveedor', 'col.status': 'Estado',
    'col.time': 'Tiempo', 'col.imeiSerial': 'IMEI/Serie', 'col.user': 'Usuario',
    'col.balance': 'Saldo', 'col.joined': 'Registro', 'col.date': 'Fecha',
    'col.type': 'Tipo', 'col.amount': 'Monto', 'col.ref': 'Ref',
    'col.network': 'Red', 'col.tx': 'TX', 'col.topup': 'Recarga',
    'btn.open': 'Abrir', 'btn.save': 'Guardar', 'btn.create': 'Crear',
    'btn.apply': 'Aplicar', 'btn.change': 'Cambiar', 'btn.view': 'Ver',
    'btn.pay': 'Pagar', 'btn.copy': 'Copiar',
    'common.optional': 'Opcional', 'common.active': 'activo', 'common.noApi': 'sin API',
    'status.active': 'Activo', 'status.disabled': 'Desactivado',
    'status.pending': 'Pendiente', 'status.approved': 'Aprobado', 'col.approval': 'Aprobación',
    'label.serial': 'N° Serie', 'label.imei': 'IMEI',
    'field.name': 'Nombre', 'field.email': 'Correo', 'field.password': 'Contraseña',
    'nav.language': 'Idioma',
    'ostatus.queued': 'Procesando', 'ostatus.processing': 'Procesando',
    'ostatus.completed': 'Completado', 'ostatus.rejected': 'Rechazado', 'ostatus.cancelled': 'Cancelado',
    'tstatus.pending': 'Pendiente', 'tstatus.confirmed': 'Confirmada', 'tstatus.expired': 'Expirada',
    'tstatus.awaiting': 'Esperando pago',
    'ltype.topup': 'Recarga', 'ltype.order': 'Compra', 'ltype.refund': 'Reembolso',
    'ltype.admin_credit': 'Ajuste +', 'ltype.admin_debit': 'Ajuste −',
    'ltype.admin_payment': 'Pago', 'ltype.admin_gift': 'Regalo',

    // ---------- public site chrome ----------
    'site.services': 'Servicios', 'site.howItWorks': 'Cómo funciona',
    'site.dashboard': 'Panel', 'site.addFunds': 'Recargar',
    'site.myAccount': 'Mi cuenta', 'site.logout': 'Salir',
    'site.login': 'Entrar', 'site.signup': 'Crear cuenta',
    'site.metaDesc': 'Servicios de desbloqueo: FMI OFF, bypass de MDM y liberación de red. Pago seguro con USDT.',
    'footer.tagline': 'Servicios de desbloqueo y software. Pagos en USDT (TRC20 / ERC20).',
    'footer.rights': 'Todos los derechos reservados.',

    // ---------- home ----------
    'home.h1': 'Desbloqueos <span class="grad">rápidos y seguros</span><br>para tu iPhone y iPad',
    'home.sub': 'FMI OFF, bypass de MDM y liberación de red con tasa de éxito del 100%. Ordena en minutos y paga de forma segura con USDT.',
    'home.badge1': '⚡ <strong>Entrega rápida</strong>',
    'home.badge2': '🔒 Pago con <strong>USDT (TRC20 / ERC20)</strong>',
    'home.badge3': '✅ <strong>100%</strong> de éxito',
    'home.badge4': '🤖 Proceso <strong>automático</strong>',
    'home.noServices': 'Aún no hay servicios cargados. Si eres el administrador, sincroniza el catálogo desde el panel.',
    'home.orderNow': 'Ordenar ahora',
    'badge.serial': '# Serie',

    // ---------- how it works ----------
    'how.step1t': 'Elige tu servicio', 'how.step1d': 'Selecciona el modelo o el tipo de desbloqueo que necesitas.',
    'how.step2t': 'Ingresa tu IMEI o Serie', 'how.step2d': 'Marca *#06# o míralo en Ajustes → General → Información.',
    'how.step3t': 'Paga con USDT', 'how.step3d': 'Envía el monto exacto por TRC20 o ERC20. Se confirma solo en minutos.',
    'how.step4t': 'Recibe el resultado', 'how.step4d': 'Procesamos tu orden y verás el resultado en tu cuenta.',
    'how.faq': 'Preguntas frecuentes',
    'how.q1': '¿Qué es USDT?',
    'how.a1': 'Es una criptomoneda estable anclada al dólar (1 USDT ≈ 1 USD). Puedes comprarla en Binance, Kraken o cualquier exchange y pagar desde tu wallet.',
    'how.q2': '¿Cuál red elijo, TRC20 o ERC20?',
    'how.a2': 'TRC20 (TRON) tiene comisiones más bajas y es la más usada. ERC20 (Ethereum) también funciona. Envía siempre por la red que elegiste.',
    'how.q3': '¿Cuánto tarda?',
    'how.a3': 'Depende del servicio: desde instantáneo hasta 24 horas. El tiempo estimado aparece en cada servicio.',

    // ---------- login ----------
    'login.sub': 'Entra para ver tus órdenes y crear nuevas.',
    'login.noAccount': '¿No tienes cuenta?',
    'login.errBadCreds': 'Correo o contraseña incorrectos',
    'login.errDisabled': 'Tu cuenta está desactivada. Contacta al soporte.',

    // ---------- register ----------
    'reg.title': 'Crear cuenta',
    'reg.sub': 'Gratis. Necesaria para ordenar y seguir tus desbloqueos.',
    'reg.passwordHint': 'Mínimo 6 caracteres.',
    'reg.haveAccount': '¿Ya tienes cuenta?',

    // ---------- otp ----------
    'otp.title': 'Verificación',
    'otp.sentA': 'Enviamos un código de 6 dígitos a', 'otp.sentB': 'Es válido por', 'otp.minutes': 'minutos',
    'otp.trust': 'Marcar este dispositivo como seguro (no pedir código aquí)',
    'otp.verify': 'Verificar', 'otp.resend': 'Reenviar código', 'otp.wait': 'espera',
    'otp.errExpired': 'El código venció. Pide uno nuevo.',
    'otp.errBlocked': 'Demasiados intentos. Pide un código nuevo.',
    'otp.errWrong': 'Código incorrecto.', 'otp.errInvalid': 'Código inválido.',

    // ---------- account ----------
    'acct.hi': 'Hola', 'acct.yourBalance': 'tu saldo', 'acct.shop': 'Comprar',
    'acct.myOrders': 'Mis pedidos',
    'acct.noOrders': 'Aún no tienes pedidos.', 'acct.browse': 'Explora los servicios →',
    'acct.noTopups': 'Sin recargas todavía.',

    // ---------- service ----------
    'svc.back': '← Volver a servicios',
    'svc.serialRequired': 'Requiere N° de Serie', 'svc.imeiRequired': 'Requiere IMEI',
    'svc.automatic': '⚡ Automático',
    'svc.loginToOrder': 'Inicia sesión para ordenar. Es gratis.',
    'svc.noAccount': '¿No tienes cuenta?', 'svc.createHere': 'Créala aquí',
    'svc.yourBalance': 'Tu saldo',
    'svc.insufficient': 'Saldo insuficiente. Te faltan ${amt}.',
    'svc.addFunds': 'Recargar saldo',
    'svc.deviceSerial': 'Número de Serie del equipo', 'svc.deviceImei': 'IMEI del equipo',
    'svc.hintSerial': 'En Ajustes → General → Información, o en la caja.',
    'svc.hintImei': 'Marca <strong>*#06#</strong> o míralo en Ajustes → General → Información.',
    'svc.orderDeduct': 'Ordenar ahora · −${amt} del saldo',
    'svc.step1serial': '1. Ingresas tu serie', 'svc.step1imei': '1. Ingresas tu IMEI',
    'svc.step2': '2. Se cobra de tu saldo', 'svc.step3': '3. Procesamos tu orden',
    'svc.step4': '4. Recibes el resultado',
    'svc.refundNote': 'Si por algo no se puede completar, se te <strong>reembolsa el saldo</strong> automáticamente.',

    // ---------- order (customer) ----------
    'ordr.back': '← Mis pedidos', 'ordr.completed': '✅ ¡Pedido completado!',
    'ordr.result': 'Resultado:', 'ordr.resultDefault': 'Procesado correctamente. Revisa tu equipo.',
    'ordr.rejected': 'No se pudo completar. Te reembolsamos <strong>${amt}</strong> a tu saldo.',
    'ordr.tryAgain': 'Intentar de nuevo', 'ordr.processing': 'Procesando tu pedido…',
    'ordr.processingNote': 'Te avisaremos por correo y aquí mismo cuando esté listo. No necesitas hacer nada más.',
    'ordr.summary': 'Resumen', 'ordr.resolvedIn': 'Resuelto en',

    // ---------- topup ----------
    'top.currentBalance': 'Tu saldo actual', 'top.addFunds': 'Recargar saldo',
    'top.sub': 'Cargas con USDT y queda disponible al instante para tus pedidos.',
    'top.notAvailable': 'Las recargas aún no están disponibles. Vuelve pronto.',
    'top.amountLabel': 'Monto a recargar (USDT)', 'top.minPh': 'Mínimo {min}',
    'top.minHint': 'Mínimo {min} USDT.', 'top.tronLowFee': 'TRON · comisión baja',
    'top.continue': 'Continuar →',

    // ---------- topup pay ----------
    'pay.back': '← Mi cuenta',
    'pay.netTron': 'USDT · red TRON (TRC20)', 'pay.netEth': 'USDT · red Ethereum (ERC20)',
    'pay.instr': 'Envía <strong>exactamente</strong> el monto de abajo a la dirección indicada, por la red correcta. Se acredita solo en 1-3 minutos.',
    'pay.exactAmount': 'Monto exacto a enviar',
    'pay.exactHint': '⚠️ Envía el monto exacto (con los centavos). Así identificamos tu recarga automáticamente.',
    'pay.onlyUsdt': 'Solo <strong>USDT</strong> por esta red. Otra red u otra moneda = pérdida de fondos.',
    'pay.address': 'Dirección', 'pay.scan': 'Escanea para pagar', 'pay.waiting': 'Esperando tu pago…',
    'pay.creditedA': '✅ Recarga acreditada. Saldo actual:', 'pay.goShopping': 'Ir a comprar',
    'pay.expired': '⌛ Esta recarga expiró sin recibir el pago.',
    'pay.createNew': 'Crear una nueva recarga', 'pay.currentBalance': 'Saldo actual',

    // ---------- category ----------
    'cat.all': '← Todos los servicios', 'cat.soon': 'Pronto agregaremos servicios en esta categoría.',

    // ---------- error pages / route messages ----------
    'err.backHome': 'Volver al inicio',
    'err.notFound': 'No encontrada', 'err.unavailable': 'No disponible',
    'err.categoryNotFound': 'Categoría no encontrada.', 'err.serviceUnavailable': 'Servicio no disponible.',
    'err.orderNotFound': 'Orden no encontrada.', 'err.topupNotFound': 'Recarga no encontrada.',
    'err.accountDisabled': 'Cuenta desactivada', 'err.accountDisabledMsg': 'Tu cuenta está desactivada. Contacta al soporte.',
    'err.accessDenied': 'Acceso denegado', 'err.adminsOnly': 'Zona solo para administradores.',
    'ordr.invalidImei': 'IMEI inválido. Deben ser 14 a 16 dígitos (marca *#06#).',
    'ordr.invalidSerial': 'Número de serie inválido (6 a 20 caracteres).',
    'ordr.insufficientMsg': 'Saldo insuficiente. Tu saldo es {bal} USDT y el servicio cuesta {price}. Recarga para continuar.',
    'ordr.chargeFail': 'No se pudo cobrar del saldo. Intenta de nuevo.',
    'top.chooseNetwork': 'Elige una red válida.',
    'top.minMsg': 'El mínimo de recarga es {min} USDT.', 'top.tooHigh': 'Monto demasiado alto.',
    'auth.invalidEmail': 'Correo inválido',
    'auth.passwordMin': 'La contraseña debe tener al menos 6 caracteres',
    'auth.emailExists': 'Ya existe una cuenta con ese correo',
    // candado de aprobación (público)
    'gate.cardGuest': '🔒 Inicia sesión para ver precios', 'gate.cardPending': '🔒 Pendiente de aprobación',
    'gate.pendingBanner': 'Tu cuenta está pendiente de aprobación. Podrás ver precios, recargar saldo y ordenar en cuanto la aprobemos.',
    'gate.serviceGuest': 'Inicia sesión para ver el precio y ordenar. Es gratis.',
    'gate.servicePending': 'Tu cuenta está pendiente de aprobación. Podrás ordenar en cuanto la aprobemos.',
    'gate.topupPending': 'Tu cuenta está pendiente de aprobación. Podrás recargar en cuanto la aprobemos.',
    'gate.notApproved': 'Tu cuenta está pendiente de aprobación.',

    // ---------- admin nav ----------
    'nav.overview': '📊 Resumen', 'nav.orders': '🧾 Órdenes', 'nav.services': '🛠 Servicios',
    'nav.users': '👥 Usuarios', 'nav.topups': '💰 Recargas', 'nav.account': '⚙ Mi cuenta', 'nav.viewStore': '↗ Ver tienda',

    // ---------- admin dashboard ----------
    'dash.title': 'Resumen', 'dash.orders': 'Pedidos', 'dash.queuedManual': 'En cola (manual)',
    'dash.processing': 'Procesando', 'dash.completed': 'Completados', 'dash.rejected': 'Rechazados',
    'dash.completedSales': 'Ventas completadas', 'dash.customers': 'Clientes',
    'dash.pendingTopups': 'Recargas pendientes', 'dash.providers': 'Proveedores',
    'dash.noProviders': 'No hay proveedores configurados. Agrégalos en el .env (bloques PROVIDER_1_*, PROVIDER_2_*).',
    'dash.latestOrders': 'Últimos pedidos', 'dash.noOrders': 'Aún no hay pedidos.',

    // ---------- admin orders ----------
    'orders.title': 'Órdenes', 'filter.all': 'Todas', 'filter.queued': 'En cola',
    'filter.processing': 'Procesando', 'filter.completed': 'Completadas', 'filter.rejected': 'Rechazadas',
    'orders.noneFilter': 'Sin órdenes en este filtro.', 'tag.refund': 'reemb.',

    // ---------- admin order detail ----------
    'order.allOrders': '← Todas las órdenes', 'order.title': 'Orden',
    'order.chargedBalance': 'Cobrado del saldo', 'order.refunded': 'reembolsado',
    'order.mode': 'Modo', 'order.modeAutomatic': 'Automático', 'order.modeManual': 'Manual',
    'order.currentProvider': 'Proveedor actual', 'order.totalTime': 'Tiempo total (cliente)',
    'order.created': 'Creada', 'order.deliveredResult': 'Resultado entregado:',
    'order.providerAttempts': 'Intentos por proveedor', 'order.noAttempts': 'Sin intentos automáticos (orden manual).',
    'attempt.sent': 'enviado (en proceso)', 'attempt.success': '✅ resuelto',
    'attempt.rejected': '⛔ rechazado', 'attempt.error': '⚠️ error',
    'attempt.cost': 'costo', 'attempt.took': 'tardó',
    'order.process': 'Procesar', 'order.resultForCustomer': 'Resultado / código para el cliente',
    'order.resultPlaceholder': 'Ej: Unlock completado. Código: 1234-5678',
    'order.markCompleted': '✅ Marcar completada y avisar',
    'order.sendProvider': '🤖 Enviar al proveedor (auto, más barato)',
    'order.confirmReject': '¿Rechazar y reembolsar el saldo al cliente?',
    'order.rejectRefund': '⛔ Rechazar y reembolsar',

    // ---------- admin services ----------
    'services.title': 'Servicios', 'services.sync': '🔄 Sincronizar',
    'services.globalMarkup': 'Markup global:', 'services.editIn': 'edítalo en el',
    'services.importedOff': 'Los servicios importados llegan apagados: préndelos cuando quieras venderlos. El cliente nunca ve proveedores ni costos.',
    'services.salePrice': 'precio venta', 'services.effectiveCost': 'costo efectivo',
    'services.visible': 'Visible', 'services.automatic': '⚡ Automático',
    'opt.globalMarkup': 'markup global', 'opt.fixedDollar': '$ fijo',
    'opt.providerCheapest': 'Proveedor: más barato', 'opt.fixed': 'Fijo:',
    'services.sources': 'Fuentes (proveedores que lo surten):', 'services.cost': 'costo',
    'services.serviceId': 'ID servicio', 'services.addSource': '+ fuente',
    'services.none': 'No hay servicios. Sincroniza desde un proveedor o espera a cargar el catálogo.',

    // ---------- admin users ----------
    'users.title': 'Usuarios', 'users.create': 'Crear usuario',
    'users.createHint': 'Útil cuando un cliente prefiere que tú le crees la cuenta. Le pasas estos datos y luego él puede cambiar su contraseña.',
    'users.autoApproveTitle': 'Aprobación de nuevos usuarios',
    'users.autoApproveOn': '🟢 Aprobación automática: ACTIVADA — los nuevos usuarios ven precios y compran de inmediato',
    'users.autoApproveOff': '🔒 Aprobación automática: DESACTIVADA — apruebas a cada nuevo usuario antes de que pueda comprar',
    'users.autoApproveTurnOn': 'Activar aprobación automática',
    'users.autoApproveTurnOff': 'Desactivar (requerir mi aprobación)',
    'user.approve': '✅ Aprobar', 'user.unapprove': '⛔ Quitar aprobación',
    'user.approvalPending': 'Pendiente — aún no puede ver precios ni comprar',

    // ---------- admin user detail ----------
    'user.allUsers': '← Todos los usuarios', 'user.newPassword1': 'Nueva contraseña para',
    'user.newPassword2': '— cópiala y envíasela al cliente (no se vuelve a mostrar).',
    'user.noName': 'Sin nombre', 'user.joined': 'registrado', 'user.status': 'Estado',
    'role.administrator': 'Administrador', 'user.orders': 'Pedidos', 'user.noOrders': 'Sin pedidos.',
    'user.balanceHistory': 'Movimientos de saldo', 'user.noActivity': 'Sin movimientos.',
    'user.actions': 'Acciones', 'user.disableBan': '🚫 Desactivar (banear)', 'user.activate': '✅ Activar',
    'user.adjustBalance': 'Ajustar saldo (+ suma, − resta)', 'user.adjustPlaceholder': 'Ej: 50 o -10',
    'user.notePlaceholder': 'Nota (opcional)', 'user.confirmPassword': '¿Cambiar la contraseña de este usuario?',
    'user.resetPassword': 'Restablecer contraseña', 'user.newBlankGenerate': 'Nueva (vacío = generar)',
    'user.resetHint': 'Si lo dejas vacío, se genera una segura y te la muestro para enviarla.',
    'user.lifetimeRecharged': 'Recargado de por vida', 'user.lifetimeGifts': 'Regalos dados',
    'user.servicesPurchased': 'Servicios comprados', 'user.totalSpent': 'Total gastado',
    'user.reasonLabel': 'Motivo', 'user.reasonPayment': 'Pago recibido (otro medio)',
    'user.reasonGift': 'Saldo de regalo', 'user.reasonCorrection': 'Corrección / quitar',
    'user.dangerZone': 'Zona de riesgo', 'user.deleteUser': '🗑 Eliminar usuario',
    'user.deleteHint': 'Permanente: elimina al cliente y todos sus pedidos, recargas e historial de saldo.',
    'user.confirmDelete': '¿Eliminar este usuario permanentemente? Esto borra sus pedidos, recargas e historial de saldo. No se puede deshacer.',

    // ---------- admin topups ----------
    'topups.title': 'Recargas', 'topups.none': 'Sin recargas.',

    // ---------- admin: mi cuenta (cambiar su propia contraseña) ----------
    'acctAdmin.title': 'Mi cuenta', 'acctAdmin.changePassword': 'Cambiar mi contraseña',
    'acctAdmin.current': 'Contraseña actual', 'acctAdmin.new': 'Nueva contraseña',
    'acctAdmin.confirm': 'Confirmar nueva contraseña', 'acctAdmin.save': 'Cambiar contraseña',
    'acctAdmin.hint': 'Es la contraseña con la que entras a tu panel.',
    'acctAdmin.ok': 'Contraseña cambiada.',
    'acctAdmin.errCurrent': 'La contraseña actual es incorrecta.',
    'acctAdmin.errMin': 'La nueva contraseña debe tener al menos 6 caracteres.',
    'acctAdmin.errMatch': 'Las contraseñas nuevas no coinciden.',
  },
};

function makeT(lang) {
  const L = dict[lang] ? lang : 'en';
  return (key, vars) => {
    let s = dict[L][key] != null ? dict[L][key] : (dict.en[key] != null ? dict.en[key] : key);
    if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
}

module.exports = { dict, makeT, LANGS: ['en', 'es'] };
