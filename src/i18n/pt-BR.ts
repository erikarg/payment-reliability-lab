import type { Dictionary } from './dictionary'

export const ptBR: Dictionary = {
  locale: { name: 'Português', short: 'PT' },

  app: {
    title: 'Payment Reliability Lab',
    tagline:
      'Um fluxo de pagamento simulado que você pode quebrar de propósito. Injete falhas, veja a máquina de estados recusar os movimentos que a corromperiam, e reconcilie o que ficou sem resposta.',
    seed: (seed) => `seed ${seed}`,
    language: 'Idioma',
    exportSession: 'exportar sessão',
    disclaimer:
      'Uma simulação de confiabilidade, não um gateway de pagamento. Nenhum dinheiro se move, nenhum adquirente é contatado, e todo provider aqui dentro é um punhado de TypeScript fingindo.',
  },

  simulator: {
    title: 'Simulador de pagamento',
    amount: 'Valor',
    riskWarning: (limit) =>
      `A partir de ${limit} o adquirente recusa por risco. Isso é uma decisão, não uma falha — retentar não muda nada.`,
    primaryProvider: 'Provider primário',
    seed: 'Seed',
    newSeed: 'Nova seed',
    speed: 'Velocidade',
    speedInstant: 'Instantâneo',
    run: 'Executar pagamento',
    running: 'Executando…',
    determinism: 'A mesma seed com as mesmas falhas produz a mesma execução, incluindo os atrasos.',
  },

  chaos: {
    title: 'Controles de caos',
    none: 'nenhuma ativa',
    active: (count) => `${count} ativa${count === 1 ? '' : 's'}`,
    footnote:
      'As falhas são lidas apenas pelos adapters dos adquirentes. O código de orquestração não enxerga este painel — ele reage ao que a interface do provider devolve.',
    persistence: (fault) => `persistência de ${fault}`,
    faults: {
      providerTimeout: {
        label: 'Timeout do provider',
        detail: 'A autorização nunca responde. A requisição pode ter sido processada mesmo assim.',
        transient: 'se recupera',
        persistent: 'nunca passa',
      },
      providerServerError: {
        label: 'Provider 5xx',
        detail: 'A autorização devolve 502. Nada aconteceu do lado do adquirente.',
        transient: 'se recupera',
        persistent: 'nunca passa',
      },
      providerUnavailable: {
        label: 'Provider indisponível',
        detail: 'O adquirente está fora. Retentar não resolve nada.',
        transient: 'só o primário',
        persistent: 'os dois adquirentes',
      },
      indeterminateCapture: {
        label: 'Captura indeterminada',
        detail: 'A chamada de captura nunca responde. Ninguém sabe se o dinheiro se moveu.',
      },
      duplicateWebhook: {
        label: 'Webhook duplicado',
        detail: 'O webhook de liquidação é entregue duas vezes, com o mesmo id de evento.',
      },
      delayedWebhook: {
        label: 'Webhook fora de ordem',
        detail: 'Um webhook de autorização atrasado chega depois da liquidação.',
      },
    },
  },

  scenarios: {
    title: 'Cenários',
    groups: {
      baseline: 'Base',
      provider: 'Falhas de provider',
      webhook: 'Falhas de webhook',
      unresolved: 'Sem resposta',
    },
    items: {
      'happy-path': {
        name: 'Caminho feliz',
        description: 'Autoriza, captura, liquida por webhook. Nada dá errado.',
      },
      'timeout-retry': {
        name: 'Timeout → retry',
        description:
          'O adquirente para de responder e depois se recupera. As retentativas levam a mesma chave de idempotência, então a decisão repetida é a original.',
      },
      'provider-failover': {
        name: 'Failover de provider',
        description:
          'O adquirente primário está fora. Retentar não adianta, então o pagamento migra para o outro.',
      },
      'total-outage': {
        name: 'Queda total',
        description:
          'Os dois adquirentes estão fora. O pagamento falha, e falha por motivo de infraestrutura.',
      },
      'server-errors': {
        name: '5xx transitório',
        description:
          'O adquirente devolve 502 duas vezes. Nada aconteceu do lado dele, então retentar é seguro.',
      },
      'duplicate-webhook': {
        name: 'Webhook duplicado',
        description:
          'O webhook de liquidação chega duas vezes com um único id de evento. A segunda entrega não muda nada.',
      },
      'delayed-webhook': {
        name: 'Webhook fora de ordem',
        description:
          'Um webhook de autorização atrasado chega depois da liquidação. Aplicá-lo empurraria o pagamento para trás.',
      },
      'indeterminate-capture': {
        name: 'Captura indeterminada',
        description:
          'A captura nunca responde. O pagamento não falhou — está pendente, e a reconciliação decide.',
      },
      'risk-decline': {
        name: 'Recusa por risco',
        description:
          'Um valor acima do limite de risco do adquirente. Uma decisão de negócio, e o único desfecho que retentativa jamais deve tocar.',
      },
    },
  },

  transaction: {
    title: 'Transação atual',
    empty: 'Nenhuma transação ainda. Escolha um cenário e execute um pagamento.',
    fields: {
      transaction: 'Transação',
      amount: 'Valor',
      provider: 'Provider',
      attempts: 'Tentativas',
      retries: 'Retentativas',
      elapsed: 'Decorrido',
      idempotencyKey: 'Chave de idempotência',
      authorization: 'Autorização',
      capture: 'Captura',
    },
    failedOverFrom: (provider) => `migrou de ${provider}`,
    exits: 'saídas',
    pending: {
      explanation:
        'A captura nunca foi confirmada. Este pagamento não falhou — está sem resposta, e só o provider pode dizer qual dos dois é.',
      run: 'Executar reconciliação',
      running: 'Reconciliando…',
      attempts: (count) => `${count} tentativa${count === 1 ? '' : 's'} até agora`,
    },
  },

  views: {
    sequence: 'Sequência',
    log: 'Log de eventos',
    events: (count) => `${count} eventos`,
    emptySequence: 'Execute um pagamento para ver as chamadas que ele faz.',
    emptyLog: 'Execute um pagamento para ver seus eventos.',
  },

  inspector: {
    title: 'Evento',
    empty: 'Selecione um evento, ou uma seta no diagrama, para inspecionar.',
    close: 'Fechar',
    payload: 'Payload',
  },
  lanes: {
    system: { label: 'Seu sistema', sublabel: 'orquestrador' },
    acquirer: { sublabel: 'adquirente' },
    endpoint: { label: 'Endpoint de webhook', sublabel: 'verifica · normaliza' },
  },

  diagram: {
    authorize: 'autorizar',
    capture: 'capturar',
    getStatus: 'consultar status',
    authorized: 'autorizado',
    replayed: 'decisão repetida',
    declined: 'recusado',
    captured: 'capturado',
    unavailable: 'indisponível',
    serverError: (status) => status,
    statusUnknown: 'ainda sem resposta',
    statusResolved: (status) => `status: ${status}`,
    noAnswer: 'sem resposta — desfecho desconhecido',
    failover: (provider) => `migrando para ${provider} — uma chave que ele nunca viu`,
    backoff: (delay) => `backoff ${delay}`,
    awaiting: (delay) => `aguardando ${delay} pelo adquirente`,
    verified: 'assinatura verificada e payload normalizado aqui',
    refusedDuplicate: 'id de evento duplicado — já processado',
    refusedBackwards: (state) => `voltaria para ${state} — recusado`,
    refusedOther: (reason) => `recusado: ${reason}`,
  },

  metrics: {
    title: 'Sessão',
    successRate: 'Taxa de sucesso',
    noData: 'nada liquidado ainda',
    settled: (completed, total) => `${completed} de ${total} liquidados`,
    transactions: 'Transações',
    completed: 'Concluídos',
    failed: 'Falhos',
    declined: 'Recusados',
    pendingReconciliation: 'Pendentes',
    retries: 'Retentativas',
    fallbacks: 'Failovers',
    duplicateWebhooks: 'Webhooks dup.',
    inFlight: 'Em andamento',
    footnote:
      'A taxa de sucesso considera apenas pagamentos liquidados. Um que ainda está em andamento não é uma falha.',
  },

  history: {
    title: 'Histórico',
    clear: 'limpar',
    empty: 'Nada executado nesta sessão ainda.',
    events: (count) => `${count} eventos`,
  },

  concepts: {
    title: 'O que isto demonstra',
    items: [
      {
        title: 'Uma máquina de estados explícita',
        body: 'Toda mudança de estado passa por uma única tabela de transições. Um pagamento não chega a COMPLETED sem ter passado por CAPTURED, e nenhum ramo do código inventa um atalho, porque não existe caminho que escreva um estado diretamente.',
      },
      {
        title: 'Recusa não é falha',
        body: 'DECLINED e FAILED são estados terminais distintos. Um é uma decisão que o adquirente tomou sobre o dinheiro; o outro é infraestrutura caindo. Retentar o segundo é correto. Retentar o primeiro é, na melhor das hipóteses, indelicado.',
      },
      {
        title: 'Idempotência, nas duas direções',
        body: 'Na saída, toda tentativa de autorização leva a mesma chave, então um adquirente que já decidiu repete aquela decisão em vez de cobrar duas vezes. Na entrada, todo webhook carrega um id de evento, então uma reentrega é reconhecida e descartada.',
      },
      {
        title: 'Retentativas com backoff e jitter',
        body: 'Três tentativas por provider, dobrando a espera a cada vez, com metade da janela aleatorizada. Jitter não é enfeite: sem ele, tudo que falhou junto retenta junto, e o provider que estava se recuperando é derrubado pelos próprios clientes.',
      },
      {
        title: 'Timeout não é falha',
        body: 'Quando uma chamada dá timeout, a requisição pode muito bem ter sido processada — o que se perdeu foi a resposta. É por isso que uma captura que deu timeout vai para CAPTURE_PENDING e não para FAILED, e por isso que só é seguro retentá-la atrás de uma chave de idempotência.',
      },
      {
        title: 'Failover, e o preço dele',
        body: 'Um provider indisponível não é retentado, é substituído. Mas o segundo adquirente nunca viu a chave de idempotência que o primeiro guarda, então o failover troca um risco por outro — exatamente por isso ele fica reservado para providers que estão genuinamente fora.',
      },
      {
        title: 'Consistência eventual',
        body: 'A liquidação chega por webhook, quando chegar. Nesse meio-tempo o pagamento fica em CAPTURED, o que é correto e não desatualizado. Um webhook atrasado mirando um estágio já ultrapassado é recusado pela mesma tabela que governa todo o resto.',
      },
      {
        title: 'Reconciliação como ação de primeira classe',
        body: 'Quando ninguém sabe o que aconteceu, a resposta é ir perguntar, não adivinhar. A reconciliação consulta o provider e aceita três respostas: foi capturado, não foi, ou ainda não se sabe — e a terceira deixa o pagamento exatamente onde estava.',
      },
      {
        title: 'O log é o estado',
        body: 'Nada guarda um campo de status. O pagamento é o que a redução dos seus eventos produz, e é por isso que um reload o reconstrói exatamente, e por isso que a timeline nunca pode discordar do selo ao lado dela.',
      },
    ],
  },

  events: {
    created: (amount) => `Pagamento criado no valor de ${amount}`,
    authorizationRequested: (provider) => `Solicitando autorização a ${provider}`,
    authorizationAttempted: (provider, attempt, max) =>
      `Tentativa ${attempt} de ${max} para ${provider}`,
    providerTimeout: (provider) => `${provider}: timeout — desfecho desconhecido`,
    providerError: (provider, status) => `${provider}: devolveu ${status}`,
    providerUnavailable: (provider) => `${provider}: indisponível`,
    retryScheduled: (delay, attempt, max) =>
      `Retentando em ${delay} (tentativa ${attempt} de ${max})`,
    fallbackSelected: (from, to) => `Migrando de ${from} para ${to}`,
    idempotentReplay: (provider) =>
      `${provider} reconheceu a chave de idempotência e repetiu a decisão original`,
    authorized: (provider) => `Autorizado por ${provider}`,
    authorizedByWebhook: (provider) => `Autorização confirmada por webhook de ${provider}`,
    declined: (provider, reason) => `Recusado por ${provider}: ${reason}`,
    exhausted: (failedOver) =>
      failedOver
        ? 'Os dois adquirentes estão inalcançáveis — desistindo'
        : 'Sem tentativas restantes e sem fallback disponível',
    captureRequested: (provider) => `Solicitando captura a ${provider}`,
    captured: (provider) => `Capturado por ${provider}`,
    capturePending:
      'O desfecho da captura é desconhecido — segurando para reconciliação em vez de falhar',
    webhookReceived: (kind, provider) => `Recebido ${kind} de ${provider}`,
    webhookDuplicate: (eventId) => `O evento ${eventId} já havia sido processado — ignorando a reentrega`,
    webhookBackwards: (kind, state) =>
      `Um ${kind} atrasado levaria o pagamento de volta para ${state} — ignorado`,
    webhookNotApplicable: (reported, current) =>
      `O webhook informa ${reported}, o pagamento já está em ${current} — nada a fazer`,
    webhookSignatureRejected: 'Webhook rejeitado no endpoint: assinatura inválida',
    completed: 'Liquidação confirmada por webhook — pagamento concluído',
    reconciliationStarted: (provider) => `Consultando ${provider} sobre o status real desta captura`,
    reconciliationInconclusive:
      'O provider ainda não consegue confirmar a captura — o pagamento segue pendente',
    reconciliationResolved: (captured) =>
      captured
        ? 'O provider confirmou que a captura foi efetivada'
        : 'O provider confirmou que a captura nunca aconteceu',
    unknown: (type) => type,
  },

  declineReasons: {
    'risk-limit': 'limite de risco excedido',
  },
}
