import type { Dictionary } from './dictionary'

export const es: Dictionary = {
  locale: { name: 'Español', short: 'ES' },

  app: {
    title: 'Payment Reliability Lab',
    tagline:
      'Un flujo de pago simulado que puedes romper a propósito. Inyecta fallos, observa cómo la máquina de estados rechaza los movimientos que la corromperían, y concilia lo que quedó sin resolver.',
    seed: (seed) => `seed ${seed}`,
    language: 'Idioma',
    exportSession: 'exportar sesión',
    disclaimer:
      'Una simulación de confiabilidad, no una pasarela de pagos. No se mueve dinero, no se contacta a ningún adquirente, y todo proveedor aquí dentro es un puñado de TypeScript fingiendo.',
  },

  simulator: {
    title: 'Simulador de pagos',
    amount: 'Importe',
    riskWarning: (limit) =>
      `A partir de ${limit} el adquirente rechaza por riesgo. Es una decisión, no un fallo — reintentar no la cambia.`,
    primaryProvider: 'Proveedor primario',
    seed: 'Seed',
    newSeed: 'Nueva seed',
    speed: 'Velocidad',
    run: 'Ejecutar pago',
    running: 'Ejecutando…',
    determinism: 'La misma seed con los mismos fallos produce la misma ejecución, demoras incluidas.',
  },

  chaos: {
    title: 'Controles de caos',
    none: 'ninguno activo',
    active: (count) => `${count} activo${count === 1 ? '' : 's'}`,
    footnote:
      'Los fallos solo los leen los adaptadores de los adquirentes. El código de orquestación no ve este panel — reacciona a lo que devuelve la interfaz del proveedor.',
    persistence: (fault) => `persistencia de ${fault}`,
    faults: {
      providerTimeout: {
        label: 'Timeout del proveedor',
        detail: 'La autorización nunca responde. La petición pudo haberse procesado igualmente.',
        transient: 'se recupera',
        persistent: 'nunca cede',
      },
      providerServerError: {
        label: 'Proveedor 5xx',
        detail: 'La autorización devuelve 502. No pasó nada del lado del adquirente.',
        transient: 'se recupera',
        persistent: 'nunca cede',
      },
      providerUnavailable: {
        label: 'Proveedor no disponible',
        detail: 'El adquirente está caído. Reintentarlo no consigue nada.',
        transient: 'solo el primario',
        persistent: 'ambos adquirentes',
      },
      indeterminateCapture: {
        label: 'Captura indeterminada',
        detail: 'La llamada de captura nunca responde. Nadie sabe si el dinero se movió.',
      },
      duplicateWebhook: {
        label: 'Webhook duplicado',
        detail: 'El webhook de liquidación se entrega dos veces, con un mismo id de evento.',
      },
      delayedWebhook: {
        label: 'Webhook fuera de orden',
        detail: 'Un webhook de autorización tardío llega después de la liquidación.',
      },
    },
  },

  scenarios: {
    title: 'Escenarios',
    groups: {
      baseline: 'Base',
      provider: 'Fallos de proveedor',
      webhook: 'Fallos de webhook',
      unresolved: 'Sin resolver',
    },
    items: {
      'happy-path': {
        name: 'Camino feliz',
        description: 'Autoriza, captura, liquida por webhook. Nada sale mal.',
      },
      'timeout-retry': {
        name: 'Timeout → reintento',
        description:
          'El adquirente deja de responder y luego se recupera. Los reintentos llevan la misma clave de idempotencia, así que la decisión repetida es la original.',
      },
      'provider-failover': {
        name: 'Failover de proveedor',
        description:
          'El adquirente primario está caído. Reintentarlo no sirve, así que el pago pasa al otro.',
      },
      'total-outage': {
        name: 'Caída total',
        description:
          'Ambos adquirentes están caídos. El pago falla, y falla por un motivo de infraestructura.',
      },
      'server-errors': {
        name: '5xx transitorio',
        description:
          'El adquirente devuelve 502 dos veces. No pasó nada de su lado, así que reintentar es seguro.',
      },
      'duplicate-webhook': {
        name: 'Webhook duplicado',
        description:
          'El webhook de liquidación llega dos veces con un único id de evento. La segunda entrega no cambia nada.',
      },
      'delayed-webhook': {
        name: 'Webhook fuera de orden',
        description:
          'Un webhook de autorización tardío llega después de la liquidación. Aplicarlo movería el pago hacia atrás.',
      },
      'indeterminate-capture': {
        name: 'Captura indeterminada',
        description:
          'La captura nunca responde. El pago no ha fallado — está pendiente, y la conciliación decide.',
      },
      'risk-decline': {
        name: 'Rechazo por riesgo',
        description:
          'Un importe por encima del límite de riesgo del adquirente. Una decisión de negocio, y el único desenlace que los reintentos jamás deben tocar.',
      },
    },
  },

  transaction: {
    title: 'Transacción actual',
    empty: 'Aún no hay transacciones. Elige un escenario y ejecuta un pago.',
    fields: {
      transaction: 'Transacción',
      amount: 'Importe',
      provider: 'Proveedor',
      attempts: 'Intentos',
      retries: 'Reintentos',
      elapsed: 'Transcurrido',
      idempotencyKey: 'Clave de idempotencia',
      authorization: 'Autorización',
      capture: 'Captura',
    },
    failedOverFrom: (provider) => `migró desde ${provider}`,
    exits: 'salidas',
    pending: {
      explanation:
        'La captura nunca se confirmó. Este pago no ha fallado — está sin resolver, y solo el proveedor puede decir cuál de las dos cosas es.',
      run: 'Ejecutar conciliación',
      running: 'Conciliando…',
      attempts: (count) => `${count} intento${count === 1 ? '' : 's'} hasta ahora`,
    },
  },

  views: {
    sequence: 'Secuencia',
    log: 'Registro de eventos',
    events: (count) => `${count} eventos`,
    emptySequence: 'Ejecuta un pago para ver las llamadas que hace.',
    emptyLog: 'Ejecuta un pago para ver sus eventos.',
  },

  inspector: {
    title: 'Evento',
    empty: 'Selecciona un evento, o una flecha del diagrama, para inspeccionarlo.',
    close: 'Cerrar',
    payload: 'Payload',
  },
  lanes: {
    system: { label: 'Tu sistema', sublabel: 'orquestador' },
    acquirer: { sublabel: 'adquirente' },
    endpoint: { label: 'Endpoint de webhook', sublabel: 'verifica · normaliza' },
  },

  diagram: {
    authorize: 'autorizar',
    capture: 'capturar',
    getStatus: 'consultar estado',
    authorized: 'autorizado',
    replayed: 'decisión repetida',
    declined: 'rechazado',
    captured: 'capturado',
    unavailable: 'no disponible',
    serverError: (status) => status,
    statusUnknown: 'aún se desconoce',
    statusResolved: (status) => `estado: ${status}`,
    noAnswer: 'sin respuesta — desenlace desconocido',
    failover: (provider) => `migrando a ${provider} — una clave que nunca ha visto`,
    backoff: (delay) => `backoff ${delay}`,
    awaiting: (delay) => `esperando ${delay} al adquirente`,
    verified: 'firma verificada y payload normalizado aquí',
    refusedDuplicate: 'id de evento duplicado — ya procesado',
    refusedBackwards: (state) => `volvería a ${state} — rechazado`,
    refusedOther: (reason) => `rechazado: ${reason}`,
  },

  metrics: {
    title: 'Sesión',
    successRate: 'Tasa de éxito',
    noData: 'nada liquidado todavía',
    settled: (completed, total) => `${completed} de ${total} liquidados`,
    transactions: 'Transacciones',
    completed: 'Completados',
    failed: 'Fallidos',
    declined: 'Rechazados',
    pendingReconciliation: 'Pendientes',
    retries: 'Reintentos',
    fallbacks: 'Failovers',
    duplicateWebhooks: 'Webhooks dup.',
    inFlight: 'En curso',
    footnote:
      'La tasa de éxito cuenta solo pagos liquidados. Uno todavía en curso no es un fallo.',
  },

  history: {
    title: 'Historial',
    clear: 'limpiar',
    empty: 'Nada ejecutado en esta sesión todavía.',
    events: (count) => `${count} eventos`,
  },

  concepts: {
    title: 'Qué demuestra esto',
    items: [
      {
        title: 'Una máquina de estados explícita',
        body: 'Todo cambio de estado pasa por una única tabla de transiciones. Un pago no llega a COMPLETED sin haber pasado por CAPTURED, y ninguna rama del código inventa un atajo, porque no existe camino que escriba un estado directamente.',
      },
      {
        title: 'Un rechazo no es un fallo',
        body: 'DECLINED y FAILED son estados terminales distintos. Uno es una decisión que el adquirente tomó sobre el dinero; el otro es infraestructura cayéndose. Reintentar el segundo es correcto. Reintentar el primero es, en el mejor de los casos, una grosería.',
      },
      {
        title: 'Idempotencia, en ambas direcciones',
        body: 'Hacia afuera, cada intento de autorización lleva la misma clave, así que un adquirente que ya decidió repite esa decisión en lugar de cobrar dos veces. Hacia adentro, cada webhook lleva un id de evento, así que una reentrega se reconoce y se descarta.',
      },
      {
        title: 'Reintentos con backoff y jitter',
        body: 'Tres intentos por proveedor, duplicando la espera cada vez, con la mitad de la ventana aleatorizada. El jitter no es adorno: sin él, todo lo que falló junto reintenta junto, y el proveedor que se estaba recuperando es derribado por sus propios clientes.',
      },
      {
        title: 'Un timeout no es un fallo',
        body: 'Cuando una llamada expira, la petición bien pudo haberse procesado — lo que se perdió fue la respuesta. Por eso una captura que expiró pasa a CAPTURE_PENDING y no a FAILED, y por eso solo es seguro reintentarla detrás de una clave de idempotencia.',
      },
      {
        title: 'El failover y su precio',
        body: 'Un proveedor no disponible no se reintenta, se reemplaza. Pero el segundo adquirente nunca ha visto la clave de idempotencia que guarda el primero, así que el failover cambia un riesgo por otro — exactamente por eso se reserva para proveedores que están genuinamente caídos.',
      },
      {
        title: 'Consistencia eventual',
        body: 'La liquidación llega por webhook, cuando llegue. Mientras tanto el pago se queda en CAPTURED, lo cual es correcto y no desactualizado. Un webhook tardío que apunta a una etapa ya superada es rechazado por la misma tabla que gobierna todo lo demás.',
      },
      {
        title: 'La conciliación como acción de primera clase',
        body: 'Cuando nadie sabe qué pasó, la respuesta es ir a preguntar, no adivinar. La conciliación consulta al proveedor y acepta tres respuestas: se capturó, no se capturó, o todavía se desconoce — y la tercera deja el pago exactamente donde estaba.',
      },
      {
        title: 'El registro es el estado',
        body: 'Nada guarda un campo de estado. El pago es lo que produce la reducción de sus eventos, y por eso una recarga lo reconstruye exactamente, y por eso la línea de tiempo nunca puede contradecir la etiqueta que tiene al lado.',
      },
    ],
  },

  events: {
    created: (amount) => `Pago creado por ${amount}`,
    authorizationRequested: (provider) => `Solicitando autorización a ${provider}`,
    authorizationAttempted: (provider, attempt, max) =>
      `Intento ${attempt} de ${max} hacia ${provider}`,
    providerTimeout: (provider) => `${provider}: timeout — desenlace desconocido`,
    providerError: (provider, status) => `${provider}: devolvió ${status}`,
    providerUnavailable: (provider) => `${provider}: no disponible`,
    retryScheduled: (delay, attempt, max) =>
      `Reintentando en ${delay} (intento ${attempt} de ${max})`,
    fallbackSelected: (from, to) => `Migrando de ${from} a ${to}`,
    idempotentReplay: (provider) =>
      `${provider} reconoció la clave de idempotencia y repitió su decisión original`,
    authorized: (provider) => `Autorizado por ${provider}`,
    authorizedByWebhook: (provider) => `Autorización confirmada por webhook de ${provider}`,
    declined: (provider, reason) => `Rechazado por ${provider}: ${reason}`,
    exhausted: (failedOver) =>
      failedOver
        ? 'Ambos adquirentes están inalcanzables — abandonando'
        : 'Sin intentos restantes y sin fallback disponible',
    captureRequested: (provider) => `Solicitando captura a ${provider}`,
    captured: (provider) => `Capturado por ${provider}`,
    capturePending:
      'El desenlace de la captura se desconoce — se retiene para conciliación en lugar de fallar',
    webhookReceived: (kind, provider) => `Recibido ${kind} de ${provider}`,
    webhookDuplicate: (eventId) => `El evento ${eventId} ya se había procesado — ignorando la reentrega`,
    webhookBackwards: (kind, state) =>
      `Un ${kind} tardío devolvería el pago a ${state} — ignorado`,
    webhookNotApplicable: (reported, current) =>
      `El webhook informa ${reported}, el pago ya está en ${current} — nada que hacer`,
    webhookSignatureRejected: 'Webhook rechazado en el endpoint: firma inválida',
    completed: 'Liquidación confirmada por webhook — pago completo',
    reconciliationStarted: (provider) =>
      `Consultando a ${provider} por el estado real de esta captura`,
    reconciliationInconclusive:
      'El proveedor todavía no puede confirmar la captura — el pago sigue pendiente',
    reconciliationResolved: (captured) =>
      captured
        ? 'El proveedor confirmó que la captura se efectuó'
        : 'El proveedor confirmó que la captura nunca ocurrió',
    unknown: (type) => type,
  },

  declineReasons: {
    'risk-limit': 'límite de riesgo excedido',
  },
}
