(function () {
  const size = 19
  const letters = 'ABCDEFGHJKLMNOPQRST'
  const canvas = document.getElementById('goban')
  const ctx = canvas.getContext('2d')
  const statusEl = document.getElementById('status')
  const modeReviewButton = document.getElementById('modeReview')
  const modeOnlineButton = document.getElementById('modeOnline')
  const modePlayButton = document.getElementById('modePlay')
  const engineToggleButton = document.getElementById('engineToggle')
  const modeLabelEl = document.getElementById('modeLabel')
  const humanBlackButton = document.getElementById('humanBlack')
  const humanWhiteButton = document.getElementById('humanWhite')
  const nextColorEl = document.getElementById('nextColor')
  const moveCountEl = document.getElementById('moveCount')
  const passButton = document.getElementById('passMove')
  const resignButton = document.getElementById('resignGame')
  const rulesButton = document.getElementById('rulesButton')
  const blackCapturesEl = document.getElementById('blackCaptures')
  const whiteCapturesEl = document.getElementById('whiteCaptures')
  const activeModelEl = document.getElementById('activeModel')
  const modelSelectEl = document.getElementById('modelSelect')
  const selectModelButton = document.getElementById('selectModel')
  const modelListEl = document.getElementById('modelList')
  const modelProgressEl = document.getElementById('modelProgress')
  const modelProgressNameEl = document.getElementById('modelProgressName')
  const modelProgressTextEl = document.getElementById('modelProgressText')
  const modelProgressFillEl = document.getElementById('modelProgressFill')
  const openModelSiteButton = document.getElementById('openModelSite')
  const importModelButton = document.getElementById('importModel')
  const refreshModelsButton = document.getElementById('refreshModels')
  const showLicensesButton = document.getElementById('showLicenses')
  const modalBackdrop = document.getElementById('modalBackdrop')
  const modalTitle = document.getElementById('modalTitle')
  const modalBody = document.getElementById('modalBody')
  const modalActions = document.getElementById('modalActions')
  const modalCloseButton = document.getElementById('modalClose')
  const engineFastButton = document.getElementById('engineFast')
  const engineBalancedButton = document.getElementById('engineBalanced')
  const engineStrongButton = document.getElementById('engineStrong')
  const engineAcceleratorModeEl = document.getElementById('engineAcceleratorMode')
  const engineVisitsSelect = document.getElementById('engineVisits')
  const engineVisitsPresets = document.getElementById('engineVisitsPresets')
  const engineTimeSelect = document.getElementById('engineTime')
  const engineThreadsSelect = document.getElementById('engineThreads')
  const engineBatchSelect = document.getElementById('engineBatch')
  const engineCacheSelect = document.getElementById('engineCache')
  const engineProfileEl = document.getElementById('engineProfile')
  const engineCurrentEl = document.getElementById('engineCurrent')
  const engineHardwareEl = document.getElementById('engineHardware')
  const engineAcceleratorEl = document.getElementById('engineAccelerator')
  const engineWarningEl = document.getElementById('engineWarning')
  const analysisList = document.getElementById('analysisList')
  const variationLine = document.getElementById('variationLine')
  const winrateGraph = document.getElementById('winrateGraph')
  const winrateCtx = winrateGraph.getContext('2d')
  const gameTreeEl = document.getElementById('gameTree')
  const sgfText = document.getElementById('sgfText')
  const modelSiteUrl = 'https://katagotraining.org/networks/kata1/'
  const rulePresets = [
    {id: 'chinese', label: 'Chinese', komi: 7.5, multiStoneSuicideLegal: false},
    {id: 'japanese', label: 'Japanese', komi: 6.5, multiStoneSuicideLegal: false},
    {id: 'aga', label: 'AGA', komi: 7.5, multiStoneSuicideLegal: false},
    {id: 'new-zealand', label: 'NZ', komi: 7.5, multiStoneSuicideLegal: true},
    {id: 'tromp-taylor', label: 'Tromp-Taylor', komi: 7.5, multiStoneSuicideLegal: true},
  ]
  const engineDefaults = {
    preset: 'balanced',
    rules: 'chinese',
    maxVisits: 'auto',
    maxTime: 'auto',
    searchThreads: 'auto',
    nnMaxBatchSize: 'auto',
    nnCacheSizePowerOfTwo: 'auto',
  }
  const savedMode = localStorage.getItem('katago.mode')
  const savedEngineOn = localStorage.getItem('katago.engineOn')
  const initialEngineOn = savedEngineOn === null
    ? localStorage.getItem('katago.autoAnalyze') !== 'false'
    : savedEngineOn === 'true'
  const engineControls = [
    {
      element: engineVisitsSelect,
      datalist: engineVisitsPresets,
      key: 'maxVisits',
      kind: 'number',
      min: 4,
      max: 1000000,
      options: [[8, '8'], [16, '16'], [32, '32'], [64, '64'], [128, '128'], [256, '256'], [512, '512'], [1024, '1024'], [2048, '2048'], [4096, '4096'], [8192, '8192'], [16384, '16384'], [32768, '32768'], [65536, '65536'], [131072, '131072'], [262144, '262144'], [524288, '524288'], [1000000, '1000000']],
    },
    {
      element: engineTimeSelect,
      key: 'maxTime',
      options: [['auto', 'Auto'], [2, '2s'], [3, '3s'], [4, '4s'], [6, '6s'], [8, '8s'], [10, '10s'], [12, '12s'], [16, '16s'], [20, '20s'], [30, '30s'], [45, '45s'], [60, '60s']],
    },
    {
      element: engineThreadsSelect,
      key: 'searchThreads',
      options: [['auto', 'Auto'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8'], [10, '10'], [12, '12']],
    },
    {
      element: engineBatchSelect,
      key: 'nnMaxBatchSize',
      options: [['auto', 'Auto'], [1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16'], [24, '24'], [32, '32']],
    },
    {
      element: engineCacheSelect,
      key: 'nnCacheSizePowerOfTwo',
      options: [['auto', 'Auto'], [13, '2^13'], [14, '2^14'], [15, '2^15'], [16, '2^16'], [17, '2^17'], [18, '2^18'], [19, '2^19'], [20, '2^20']],
    },
  ]

  let nodeSeq = 1
  const state = {
    tree: {
      root: {id: 'root', parent: null, children: [], move: null},
      nodes: {root: null},
    },
    currentNodeId: 'root',
    stones: emptyBoard(),
    line: [],
    captures: {black: 0, white: 0},
    nextColor: 'black',
    analysis: [],
    selectedAnalysis: -1,
    models: [],
    modelChoiceId: null,
    modelBusy: false,
    modelDownload: null,
    engineSettings: loadEngineSettings(),
    engineEffective: null,
    hardwareInfo: null,
    engineResolveToken: 0,
    analysisGeneration: 0,
    analysisRequestToken: 0,
    pendingAnalysisStatus: null,
    enginePendingRefresh: false,
    engineRefreshInFlight: false,
    engineReplyActive: false,
    analysisRunning: false,
    onlineStartInFlight: false,
    onlineStreamId: null,
    onlinePositionSignature: null,
    busy: false,
    gameOver: false,
    mode: ['review', 'online', 'play'].includes(savedMode) ? savedMode : 'review',
    humanColor: localStorage.getItem('katago.humanColor') === 'white' ? 'white' : 'black',
    engineOn: initialEngineOn,
    autoTimer: null,
  }
  state.tree.nodes.root = state.tree.root

  const pending = new Map()
  window.katagoNativeResponse = (id, payload) => {
    const callbacks = pending.get(id)
    if (!callbacks) return
    pending.delete(id)
    payload.ok ? callbacks.resolve(payload) : callbacks.reject(new Error(payload.error || 'KataGo failed'))
  }

  window.katagoNativeDownloadProgress = (payload) => {
    state.modelDownload = payload
    const percent = Math.round((payload.progress || 0) * 100)
    setStatus(`Downloading model: ${percent}%`)
    redrawUi()
  }

  window.katagoNativeAnalysisUpdate = (payload) => {
    if (!payload || payload.streamId !== state.onlineStreamId) return
    const selectedMove = state.analysis[state.selectedAnalysis]?.gtp || null
    state.analysis = payload.moves || []
    state.selectedAnalysis = selectedMove
      ? state.analysis.findIndex((move) => move.gtp === selectedMove)
      : -1
    state.engineEffective = {
      profile: payload.profile || state.engineEffective?.profile || '-',
      settings: payload.profileSettings || state.engineEffective?.settings || null,
      totalVisits: Number(payload.totalVisits || 0),
      warnings: payload.profileWarnings || [],
    }
    const node = state.tree.nodes[state.currentNodeId]
    node.eval = state.analysis[0] || node.eval || null
    const visits = state.engineEffective.totalVisits ? ` · ${state.engineEffective.totalVisits} visits` : ''
    const elapsed = Number.isFinite(payload.elapsedMs) ? ` · ${payload.elapsedMs}ms` : ''
    setStatus(`Engine online: ${state.analysis.length} candidates${visits}${elapsed}`)
    redrawUi()
  }

  function callNative(action, payload) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      pending.set(id, {resolve, reject})

      if (!window.webkit || !window.webkit.messageHandlers || !window.webkit.messageHandlers.katago) {
        pending.delete(id)
        reject(new Error('iOS KataGo bridge is unavailable'))
        return
      }

      window.webkit.messageHandlers.katago.postMessage({id, action, payload})
    })
  }

  function emptyBoard() {
    return Array.from({length: size}, () => Array(size).fill(null))
  }

  function setStatus(text) {
    statusEl.textContent = text
  }

  function showModal(title, html, actions = []) {
    modalTitle.textContent = title
    modalBody.innerHTML = html
    modalActions.innerHTML = ''
    for (const action of actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = action.label
      if (action.primary) button.className = 'primary'
      button.addEventListener('click', action.handler)
      modalActions.appendChild(button)
    }
    modalBackdrop.hidden = false
  }

  function hideModal() {
    modalBackdrop.hidden = true
  }

  function showLicenses() {
    showModal('Licenses', `
      <h3>KataGo</h3>
      <p>KataGo source code is used under a permissive MIT-style license. Copyright 2025 David J Wu ("lightvector") and contributors. The license permits use, copy, modification, distribution, sublicense, and sale, provided the copyright and permission notice are included.</p>
      <h3>Sabaki</h3>
      <p>Sabaki UI ideas and compatible workflows are used under the MIT License. Copyright 2015-2020 Yichuan Shen. This app is not the official Sabaki app.</p>
      <h3>KataGo neural networks / zhizi networks</h3>
      <p>KataGo neural network files, including zhizi networks imported by the user, are provided under the KataGo neural network MIT-style license published at katagotraining.org/network_license/. This app is not an official KataGo or katagotraining.org product.</p>
      <h3>Third-party dependencies</h3>
      <p>KataGo includes third-party notices for CLBlast (Apache License 2.0), filesystem, half, httplib, nlohmann_json, tclap, Mozilla CA certificates, and SHA2-derived code. Include the corresponding original notice files when redistributing binaries.</p>
    `, [
      {label: 'Close', handler: hideModal},
    ])
  }

  function loadEngineSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('katago.engineSettings') || '{}')
      return {...engineDefaults, ...saved}
    } catch (_) {
      return {...engineDefaults}
    }
  }

  function renderHardwareInfo() {
    const info = state.hardwareInfo
    const settings = state.engineEffective?.settings || {}
    if (!info) {
      engineHardwareEl.textContent = '-'
      engineAcceleratorEl.textContent = '-'
      return
    }
    const memory = Number.isFinite(info.memoryGB) ? `${Number(info.memoryGB).toFixed(1)}GB` : '-'
    const cpuShape = info.performanceCpuCores && info.efficiencyCpuCores
      ? ` (${info.performanceCpuCores}P+${info.efficiencyCpuCores}E)`
      : ''
    const gpuShape = info.gpuCores ? ` · GPU ${info.gpuCores}` : ''
    engineHardwareEl.textContent = `CPU ${info.cpuCores || '-'}${cpuShape}${gpuShape} · RAM ${memory} · thermal ${info.thermalState || '-'}`
    const gpu = info.metalSupported ? `Metal GPU: ${info.gpuName || 'Apple GPU'}` : 'Metal GPU unavailable'
    const effective = settings.effectiveAccelerator || 'metal'
    engineAcceleratorEl.textContent = `Active ${effective.toUpperCase()} · ${gpu}`
  }

  function saveEngineSettings() {
    localStorage.setItem('katago.engineSettings', JSON.stringify(state.engineSettings))
  }

  function currentRules() {
    return rulePresets.find((rules) => rules.id === state.engineSettings.rules) || rulePresets[0]
  }

  function enginePayload(options = {}) {
    const online = options.online ?? state.mode === 'online'
    const rules = currentRules()
    const payload = {
      preset: state.engineSettings.preset,
      rules: rules.id,
      komi: rules.komi,
    }
    if (online) payload.online = true
    for (const control of engineControls) {
      if (online && (control.key === 'maxVisits' || control.key === 'maxTime')) continue
      const value = state.engineSettings[control.key]
      if (value === 'auto' || value === undefined || value === null || value === '') continue
      const numeric = Number(value)
      if (Number.isFinite(numeric)) payload[control.key] = numeric
    }
    return payload
  }

  function effectiveSettingsFromProfile(profileSettings) {
    if (!profileSettings) return null
    const next = {
      preset: profileSettings.preset || state.engineSettings.preset,
      rules: profileSettings.rules || state.engineSettings.rules,
    }
    for (const control of engineControls) {
      if (profileSettings.online && (control.key === 'maxVisits' || control.key === 'maxTime')) continue
      if (profileSettings[control.key] !== undefined) {
        next[control.key] = Number(profileSettings[control.key])
      }
    }
    return next
  }

  function applyEffectiveEngineSettings(profileSettings) {
    const effective = effectiveSettingsFromProfile(profileSettings)
    if (!effective) return
    state.engineSettings = {...state.engineSettings, ...effective}
    saveEngineSettings()
  }

  function fillEngineControls() {
    for (const control of engineControls) {
      if (control.kind === 'number') {
        if (!control.datalist) continue
        control.datalist.innerHTML = ''
        for (const [value, label] of control.options) {
          const option = document.createElement('option')
          option.value = String(value)
          option.label = label
          control.datalist.appendChild(option)
        }
        continue
      }
      control.element.innerHTML = ''
      for (const [value, label] of control.options) {
        const option = document.createElement('option')
        option.value = String(value)
        option.textContent = label
        control.element.appendChild(option)
      }
    }
  }

  function renderEngineSettings() {
    engineFastButton.classList.toggle('active', state.engineSettings.preset === 'fast')
    engineBalancedButton.classList.toggle('active', state.engineSettings.preset === 'balanced')
    engineStrongButton.classList.toggle('active', state.engineSettings.preset === 'strong')
    engineAcceleratorModeEl.textContent = 'Metal'
    engineFastButton.disabled = false
    engineBalancedButton.disabled = false
    engineStrongButton.disabled = false
    for (const control of engineControls) {
      const value = state.engineSettings[control.key] ?? 'auto'
      const disabledForOnline = state.mode === 'online' && (control.key === 'maxVisits' || control.key === 'maxTime')
      if (control.kind === 'number') {
        control.element.value = value === 'auto' ? '' : String(value)
        control.element.placeholder = 'Auto'
        control.element.min = String(control.min || 1)
        const profileMax = state.engineEffective?.settings?.maxAllowedVisits
        control.element.max = String(profileMax || control.max || 1000000)
      } else {
        ensureEngineOption(control, value)
        control.element.value = String(value)
      }
      control.element.disabled = disabledForOnline
    }
    engineProfileEl.textContent = state.engineEffective?.profile || '-'
    const searched = state.engineEffective?.totalVisits
    const target = state.engineEffective?.settings?.maxVisits || state.engineSettings.maxVisits
    const targetVisits = Number(target)
    const completedVisits = Number.isFinite(Number(searched)) ? Math.max(0, Number(searched)) : 0
    const onlineProfile = state.mode === 'online' || state.engineEffective?.settings?.online
    if (onlineProfile && state.analysisRunning) {
      engineCurrentEl.textContent = `Online running · latest ${completedVisits} visits`
    } else if (onlineProfile) {
      engineCurrentEl.textContent = completedVisits ? `Online latest · ${completedVisits} visits` : 'Online ready'
    } else if (state.analysisRunning && Number.isFinite(targetVisits)) {
      const time = state.engineEffective?.settings?.maxTime || state.engineSettings.maxTime
      const timeText = Number.isFinite(Number(time)) ? ` / ${time}s` : ''
      engineCurrentEl.textContent = `Visits ${Math.min(completedVisits, targetVisits)} / ${targetVisits} running${timeText}`
    } else if (Number.isFinite(completedVisits) && Number.isFinite(targetVisits)) {
      const adjusted = Math.abs(targetVisits - completedVisits) <= Math.max(1, Math.ceil(targetVisits * 0.02))
        ? targetVisits
        : completedVisits
      engineCurrentEl.textContent = adjusted === targetVisits
        ? `Visits ${targetVisits} / ${targetVisits} complete`
        : `Visits ${adjusted} / ${targetVisits}`
    } else if (Number.isFinite(targetVisits)) {
      engineCurrentEl.textContent = `Visits 0 / ${targetVisits} target`
    } else {
      engineCurrentEl.textContent = '-'
    }
    renderHardwareInfo()
    const warnings = state.engineEffective?.warnings || []
    engineWarningEl.textContent = warnings.length ? warnings.join(' · ') : '-'
  }

  function ensureEngineOption(control, value) {
    if (value === undefined || value === null) return
    if (control.kind === 'number') return
    const stringValue = String(value)
    if ([...control.element.options].some((option) => option.value === stringValue)) return
    const option = document.createElement('option')
    option.value = stringValue
    option.textContent = control.key === 'nnCacheSizePowerOfTwo' ? `2^${stringValue}` : stringValue
    control.element.appendChild(option)
  }

  async function resolveEngineProfile(options = {}) {
    const token = ++state.engineResolveToken
    try {
      const response = await callNative('resolveInference', {inference: enginePayload()})
      if (token !== state.engineResolveToken) return null
      state.engineEffective = {
        profile: response.profile || '-',
        settings: response.profileSettings || null,
        totalVisits: state.engineEffective?.totalVisits ?? null,
        warnings: response.profileWarnings || [],
      }
      if (options.applyToControls) applyEffectiveEngineSettings(response.profileSettings)
      redrawUi()
      return response.profileSettings || null
    } catch (_) {
      return null
    }
  }

  function invalidateCurrentAnalysis() {
    state.analysisGeneration += 1
    state.analysis = []
    state.selectedAnalysis = -1
    state.engineEffective = {...(state.engineEffective || {}), totalVisits: null}
    state.onlinePositionSignature = null
  }

  function startAnalysisForCurrentMode() {
    if (state.gameOver || state.busy || !state.engineOn) return
    if (state.mode === 'play' && state.nextColor !== state.humanColor) {
      engineReply()
    } else if (state.mode === 'online') {
      scheduleOnlineAnalysis(0)
    } else {
      scheduleAnalyze(0)
    }
  }

  async function flushPendingEngineRefresh() {
    if (state.busy || !state.enginePendingRefresh || state.engineRefreshInFlight) return
    state.engineRefreshInFlight = true
    state.enginePendingRefresh = false
    setStatus('Applying engine settings...')
    redrawUi()
    await resolveEngineProfile({applyToControls: true})
    state.engineRefreshInFlight = false
    state.pendingAnalysisStatus = null
    startAnalysisForCurrentMode()
  }

  async function refreshAfterEngineSettingsChanged() {
    invalidateCurrentAnalysis()
    if (state.busy) {
      state.enginePendingRefresh = true
      setStatus('Engine settings queued')
      redrawUi()
      stopRunningAnalysis()
      return
    }
    await resolveEngineProfile({applyToControls: true})
    redrawUi()
    startAnalysisForCurrentMode()
  }

  async function setEnginePreset(preset) {
    state.engineSettings.preset = preset
    for (const control of engineControls) {
      state.engineSettings[control.key] = 'auto'
    }
    saveEngineSettings()
    await refreshAfterEngineSettingsChanged()
  }

  async function setEngineControl(key, value) {
    const control = engineControls.find((item) => item.key === key)
    if (control?.kind === 'number') {
      const trimmed = String(value ?? '').trim()
      if (trimmed === '' || trimmed.toLowerCase() === 'auto') {
        state.engineSettings[key] = 'auto'
      } else {
        const numeric = Number(trimmed)
        if (!Number.isFinite(numeric)) {
          state.engineSettings[key] = 'auto'
        } else {
          const profileMax = state.engineEffective?.settings?.maxAllowedVisits
          const maxValue = profileMax || control.max || numeric
          state.engineSettings[key] = Math.max(control.min || 1, Math.min(maxValue, Math.round(numeric)))
        }
      }
    } else {
      state.engineSettings[key] = value === 'auto' ? 'auto' : Number(value)
    }
    saveEngineSettings()
    await refreshAfterEngineSettingsChanged()
  }

  async function cycleRules() {
    const currentIndex = Math.max(0, rulePresets.findIndex((rules) => rules.id === currentRules().id))
    const nextRules = rulePresets[(currentIndex + 1) % rulePresets.length]
    state.engineSettings.rules = nextRules.id
    saveEngineSettings()
    setStatus(`Rules: ${nextRules.label}, komi ${nextRules.komi}`)
    await refreshAfterEngineSettingsChanged()
  }

  function stopRunningAnalysis() {
    state.analysisRequestToken += 1
    clearTimeout(state.autoTimer)
    state.onlineStreamId = null
    state.onlinePositionSignature = null
    state.onlineStartInFlight = false
    if (state.mode === 'online') {
      state.analysisRunning = false
      state.busy = false
    }
    callNative('stopAnalysis', {}).catch(() => {})
  }

  function stopOnlineAnalysisForMove() {
    if (!(state.mode === 'online' && (state.analysisRunning || state.onlineStartInFlight))) return
    stopRunningAnalysis()
  }

  function rebuildPosition() {
    const position = positionForNode(state.currentNodeId)
    state.stones = position.stones
    state.line = position.line
    state.captures = position.captures
    const last = state.line[state.line.length - 1]
    state.nextColor = !last || last.color === 'white' ? 'black' : 'white'
  }

  function positionForNode(nodeId) {
    const stones = emptyBoard()
    const captures = {black: 0, white: 0}
    const line = pathTo(nodeId).map((node) => node.move)
    for (const move of line) {
      if (move.isPass) continue
      const result = applyMove(stones, move)
      if (result.ok) {
        captures[move.color] += result.captures.length
        copyBoard(result.board, stones)
      }
    }
    return {stones, line, captures}
  }

  function addMove(point, color = state.nextColor, options = {}) {
    stopOnlineAnalysisForMove()
    if (!point || state.busy || state.gameOver) return false

    const legal = legalMove(point, color)
    if (!legal.ok) {
      setStatus(legal.reason)
      return false
    }

    const parent = state.tree.nodes[state.currentNodeId]
    const existing = parent.children
      .map((id) => state.tree.nodes[id])
      .find((node) => !node.move.isPass && node.move.x === point.x && node.move.y === point.y && node.move.color === color)

    if (existing) {
      state.currentNodeId = existing.id
    } else {
      const node = {
        id: `n${nodeSeq++}`,
        parent: parent.id,
        children: [],
        move: {color, x: point.x, y: point.y, captures: legal.captures},
        eval: null,
      }
      state.tree.nodes[node.id] = node
      parent.children.push(node.id)
      state.currentNodeId = node.id
    }

    invalidateCurrentAnalysis()
    rebuildPosition()
    setStatus(`${colorName(color)} ${vertexToGtp(point.x, point.y)}`)
    redrawUi()
    if (!options.silent) handlePositionChanged(options)
    return true
  }

  function addPass(color = state.nextColor, options = {}) {
    stopOnlineAnalysisForMove()
    if (state.busy || state.gameOver) return false

    const parent = state.tree.nodes[state.currentNodeId]
    const existing = parent.children
      .map((id) => state.tree.nodes[id])
      .find((node) => node.move.isPass && node.move.color === color)

    if (existing) {
      state.currentNodeId = existing.id
    } else {
      const node = {
        id: `n${nodeSeq++}`,
        parent: parent.id,
        children: [],
        move: {color, isPass: true},
        eval: null,
      }
      state.tree.nodes[node.id] = node
      parent.children.push(node.id)
      state.currentNodeId = node.id
    }

    invalidateCurrentAnalysis()
    rebuildPosition()
    const previous = state.line[state.line.length - 2]
    if (previous && previous.isPass) state.gameOver = true
    setStatus(state.gameOver ? 'Both players passed' : `${colorName(color)} pass`)
    redrawUi()
    if (!state.gameOver && !options.silent) handlePositionChanged(options)
    return true
  }

  function colorName(color) {
    return color === 'black' ? 'Black' : 'White'
  }

  function boardMetrics() {
    const pad = 62
    const board = canvas.width - pad * 2
    const cell = board / (size - 1)
    return {pad, cell}
  }

  function draw() {
    const w = canvas.width
    const h = canvas.height
    const {pad, cell} = boardMetrics()

    const gradient = ctx.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, '#e0aa5a')
    gradient.addColorStop(1, '#bd7a33')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(58, 31, 12, 0.88)'
    ctx.lineWidth = 2
    for (let i = 0; i < size; i++) {
      const p = pad + i * cell
      ctx.beginPath()
      ctx.moveTo(p, pad)
      ctx.lineTo(p, h - pad)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pad, p)
      ctx.lineTo(w - pad, p)
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(58, 31, 12, 0.9)'
    for (const x of [3, 9, 15]) {
      for (const y of [3, 9, 15]) {
        ctx.beginPath()
        ctx.arc(pad + x * cell, pad + y * cell, 5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.font = '24px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(58, 31, 12, 0.68)'
    for (let i = 0; i < size; i++) {
      const p = pad + i * cell
      ctx.fillText(letters[i], p, 28)
      ctx.fillText(String(size - i), 28, p)
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const stone = state.stones[y][x]
        if (stone) drawStone(pad + x * cell, pad + y * cell, cell * 0.45, stone, 1)
      }
    }

    drawAnalysis(pad, cell)
    drawSelectedVariation(pad, cell)
  }

  function drawAnalysis(pad, cell) {
    const maxVisits = Math.max(1, ...state.analysis.map((move) => move.visits || 0))
    for (const [index, move] of state.analysis.entries()) {
      if (move.isPass || move.x < 0 || move.y < 0) continue
      const cx = pad + move.x * cell
      const cy = pad + move.y * cell
      const radius = Math.max(13, 30 * Math.sqrt((move.visits || 0) / maxVisits))
      ctx.fillStyle = index === state.selectedAnalysis ? 'rgba(49, 124, 116, 0.95)' : 'rgba(42, 111, 104, 0.72)'
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fffaf2'
      ctx.font = `bold ${radius >= 22 ? 17 : 14}px -apple-system, sans-serif`
      ctx.fillText(analysisLabel(move), cx, cy - 2)
    }
  }

  function drawSelectedVariation(pad, cell) {
    const move = state.analysis[state.selectedAnalysis]
    if (!move || !Array.isArray(move.pv)) return

    let color = state.nextColor
    const preview = previewBoard()
    const points = []
    for (const [index, gtp] of move.pv.entries()) {
      const point = gtpToPoint(gtp)
      if (!point) {
        color = otherColor(color)
        continue
      }
      const result = applyMove(preview, {color, x: point.x, y: point.y})
      if (!result.ok) continue
      copyBoard(result.board, preview)
      for (const captured of result.captures) {
        const capturedIndex = points.findIndex((item) => item.x === captured.x && item.y === captured.y)
        if (capturedIndex >= 0) points.splice(capturedIndex, 1)
      }
      points.push({...point, color, index: index + 1})
      color = otherColor(color)
    }

    for (const point of points) {
      const cx = pad + point.x * cell
      const cy = pad + point.y * cell
      drawStone(cx, cy, cell * 0.35, point.color, 0.72)
      ctx.fillStyle = point.color === 'black' ? '#f2eee8' : '#1f1f1f'
      ctx.font = 'bold 18px -apple-system, sans-serif'
      ctx.fillText(String(point.index), cx, cy)
    }
  }

  function previewBoard() {
    return state.stones.map((row) => row.slice())
  }

  function copyBoard(source, target) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) target[y][x] = source[y][x]
    }
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice())
  }

  function legalMove(point, color) {
    if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size) {
      return {ok: false, reason: 'Move is outside the board'}
    }

    const parent = state.tree.nodes[state.currentNodeId]
    const koHash = parent.parent ? boardHash(positionForNode(parent.parent).stones) : null
    return applyMove(state.stones, {color, x: point.x, y: point.y}, koHash)
  }

  function applyMove(board, move, koHash = null) {
    if (board[move.y][move.x]) return {ok: false, reason: 'Point is occupied'}

    const next = cloneBoard(board)
    const captured = []
    const selfCaptured = []
    next[move.y][move.x] = move.color

    for (const neighbor of neighbors(move.x, move.y)) {
      if (next[neighbor.y][neighbor.x] !== otherColor(move.color)) continue
      const group = collectGroup(next, neighbor.x, neighbor.y)
      if (group.liberties.size > 0) continue
      for (const stone of group.stones) {
        next[stone.y][stone.x] = null
        captured.push(stone)
      }
    }

    const ownGroup = collectGroup(next, move.x, move.y)
    if (ownGroup.liberties.size === 0) {
      if (!currentRules().multiStoneSuicideLegal) return {ok: false, reason: 'Suicide is not legal under current rules'}
      for (const stone of ownGroup.stones) {
        next[stone.y][stone.x] = null
        selfCaptured.push(stone)
      }
    }
    if (koHash && boardHash(next) === koHash) return {ok: false, reason: 'Ko recapture is not legal'}

    return {ok: true, board: next, captures: captured, selfCaptures: selfCaptured}
  }

  function collectGroup(board, x, y) {
    const color = board[y][x]
    const stones = []
    const liberties = new Set()
    const seen = new Set()
    const stack = [{x, y}]

    while (stack.length) {
      const point = stack.pop()
      const key = pointKey(point.x, point.y)
      if (seen.has(key)) continue
      seen.add(key)
      stones.push(point)

      for (const neighbor of neighbors(point.x, point.y)) {
        const occupant = board[neighbor.y][neighbor.x]
        if (!occupant) {
          liberties.add(pointKey(neighbor.x, neighbor.y))
        } else if (occupant === color) {
          stack.push(neighbor)
        }
      }
    }

    return {stones, liberties}
  }

  function neighbors(x, y) {
    const points = []
    if (x > 0) points.push({x: x - 1, y})
    if (x < size - 1) points.push({x: x + 1, y})
    if (y > 0) points.push({x, y: y - 1})
    if (y < size - 1) points.push({x, y: y + 1})
    return points
  }

  function boardHash(board) {
    return board.map((row) => row.map((stone) => stone ? stone[0] : '.').join('')).join('/')
  }

  function pointKey(x, y) {
    return `${x},${y}`
  }

  function otherColor(color) {
    return color === 'black' ? 'white' : 'black'
  }

  function drawStone(x, y, r, color, alpha) {
    ctx.save()
    ctx.globalAlpha = alpha
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
    if (color === 'black') {
      g.addColorStop(0, '#5c5a55')
      g.addColorStop(1, '#090909')
    } else {
      g.addColorStop(0, '#ffffff')
      g.addColorStop(1, '#d8d2c8')
    }
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color === 'black' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)'
    ctx.stroke()
    ctx.restore()
  }

  function redrawUi() {
    modeLabelEl.textContent = state.mode === 'play' ? 'Play Game' : (state.mode === 'online' ? 'Online' : 'Review')
    nextColorEl.textContent = state.gameOver ? 'Done' : colorName(state.nextColor)
    moveCountEl.textContent = String(state.line.length)
    blackCapturesEl.textContent = `B ${state.captures.black}`
    whiteCapturesEl.textContent = `W ${state.captures.white}`
    modeReviewButton.classList.toggle('active', state.mode === 'review')
    modeOnlineButton.classList.toggle('active', state.mode === 'online')
    modePlayButton.classList.toggle('active', state.mode === 'play')
    humanBlackButton.classList.toggle('active', state.humanColor === 'black')
    humanWhiteButton.classList.toggle('active', state.humanColor === 'white')
    engineToggleButton.classList.toggle('active', state.engineOn && state.mode !== 'play')
    engineToggleButton.textContent = state.engineOn && state.mode !== 'play' ? 'Engine Off' : 'Engine On'
    engineToggleButton.disabled = state.mode === 'play'
    const engineTurn = state.mode === 'play' && state.nextColor !== state.humanColor
    const blockedByAnalysis = state.busy && state.mode !== 'online'
    passButton.disabled = blockedByAnalysis || state.gameOver || engineTurn
    resignButton.disabled = blockedByAnalysis || state.gameOver || engineTurn
    const rules = currentRules()
    rulesButton.textContent = `Rules ${rules.label}`
    rulesButton.disabled = false
    importModelButton.disabled = state.modelBusy
    refreshModelsButton.disabled = state.modelBusy
    renderEngineSettings()
    renderModels()
    renderAnalysis()
    renderVariation()
    renderWinrateGraph()
    renderGameTree()
    draw()
  }

  function renderAnalysis() {
    analysisList.innerHTML = ''

    for (const [index, move] of state.analysis.entries()) {
      const li = document.createElement('li')
      const selected = index === state.selectedAnalysis
      if (selected) li.className = 'selected'
      const winrate = typeof move.winrate === 'number' ? `${(move.winrate * 100).toFixed(1)}%` : '-'
      const lead = typeof move.scoreLead === 'number' ? move.scoreLead.toFixed(2) : '-'
      const pv = Array.isArray(move.pv) ? move.pv.slice(0, 10).join(' ') : ''
      li.innerHTML = `
        <div class="moveLine"><span>${escapeHtml(move.gtp)}</span><span>${winrate}</span></div>
        <div class="moveMeta">visits ${move.visits || 0} · lead ${lead} · prior ${percent(move.policyPrior)}</div>
        ${selected && pv ? `<div class="pvLine">${escapeHtml(pv)}</div>` : ''}
      `
      li.addEventListener('click', () => {
        selectAnalysis(index)
      })
      analysisList.appendChild(li)
    }
  }

  function renderModels() {
    modelListEl.innerHTML = ''
    const selected = state.models.find((model) => model.selected)
    activeModelEl.textContent = selected ? shortModelName(selected.name) : 'Model required'
    const activeID = selected ? selected.id : ''
    if (!state.models.some((model) => model.id === state.modelChoiceId)) {
      state.modelChoiceId = activeID
    }
    renderModelSelect(activeID)
    renderModelProgress()

    for (const model of state.models) {
      const li = document.createElement('li')
      if (model.selected) li.className = 'current'
      const selectedLabel = model.selected ? '<span class="modelState">Selected</span>' : ''
      const deleteButton = model.deletable === false
        ? '<span class="modelState">Bundled</span>'
        : `<button type="button" data-delete="true"${state.modelBusy ? ' disabled' : ''}>Delete</button>`
      const accelerators = Array.isArray(model.accelerators) && model.accelerators.length
        ? ` · ${model.accelerators.join(' + ')}`
        : ''
      li.innerHTML = `
        <div class="modelName">${escapeHtml(shortModelName(model.name))}</div>
        <div class="modelMeta">${escapeHtml(model.source || '')} · ${formatBytes(model.bytes || 0)}${escapeHtml(accelerators)}</div>
        <div class="inlineActions">${selectedLabel}${deleteButton}</div>
      `
      const remove = li.querySelector('[data-delete="true"]')
      if (remove) remove.addEventListener('click', () => deleteModel(model.id))
      modelListEl.appendChild(li)
    }
  }

  function renderModelSelect(activeID) {
    modelSelectEl.innerHTML = ''
    for (const model of state.models) {
      const option = document.createElement('option')
      option.value = model.id
      const accelerators = Array.isArray(model.accelerators) && model.accelerators.length
        ? ` · ${model.accelerators.join(' + ')}`
        : ''
      option.textContent = `${shortModelName(model.name)} (${model.source || 'Model'}${accelerators})`
      modelSelectEl.appendChild(option)
    }

    modelSelectEl.value = state.modelChoiceId || activeID
    modelSelectEl.disabled = state.modelBusy || state.models.length === 0
    selectModelButton.disabled = (
      state.modelBusy ||
      state.models.length === 0 ||
      !state.modelChoiceId ||
      state.modelChoiceId === activeID
    )
  }

  function activeModelId(models = state.models) {
    const selected = models.find((model) => model.selected)
    return selected ? selected.id : ''
  }

  function updateModelSelectState() {
    const activeID = activeModelId()
    modelSelectEl.disabled = state.modelBusy || state.models.length === 0
    selectModelButton.disabled = (
      state.modelBusy ||
      state.models.length === 0 ||
      !state.modelChoiceId ||
      state.modelChoiceId === activeID
    )
  }

  function renderModelProgress() {
    if (!state.modelDownload) {
      modelProgressEl.hidden = true
      modelProgressFillEl.style.width = '0%'
      return
    }

    const progress = Math.max(0, Math.min(1, state.modelDownload.progress || 0))
    modelProgressEl.hidden = false
    modelProgressNameEl.textContent = shortModelName(state.modelDownload.name || 'KataGo model')
    modelProgressTextEl.textContent = state.modelDownload.bytesExpected > 0
      ? `${Math.round(progress * 100)}%`
      : formatBytes(state.modelDownload.bytesWritten || 0)
    modelProgressFillEl.style.width = `${Math.round(progress * 100)}%`
  }

  function renderVariation() {
    const move = state.analysis[state.selectedAnalysis]
    if (!move) {
      variationLine.textContent = 'Select a candidate'
      return
    }
    const pv = Array.isArray(move.pv) && move.pv.length > 0 ? move.pv.join(' ') : move.gtp
    variationLine.textContent = `${move.gtp}: ${pv}`
  }

  function renderWinrateGraph() {
    const w = winrateGraph.width
    const h = winrateGraph.height
    winrateCtx.clearRect(0, 0, w, h)
    winrateCtx.fillStyle = '#211e1a'
    winrateCtx.fillRect(0, 0, w, h)

    winrateCtx.strokeStyle = 'rgba(255,255,255,0.10)'
    winrateCtx.lineWidth = 1
    for (const y of [0.25, 0.5, 0.75]) {
      const py = h - y * h
      winrateCtx.beginPath()
      winrateCtx.moveTo(0, py)
      winrateCtx.lineTo(w, py)
      winrateCtx.stroke()
    }

    const nodes = pathTo(state.currentNodeId)
    const points = nodes
      .map((node, index) => ({index: index + 1, eval: node.eval}))
      .filter((point) => point.eval && typeof point.eval.winrate === 'number')

    const current = state.analysis[0]
    if (current) points.push({index: nodes.length + 1, eval: current})

    if (points.length === 0) {
      winrateCtx.fillStyle = '#9e958b'
      winrateCtx.font = '24px -apple-system, sans-serif'
      winrateCtx.textAlign = 'center'
      winrateCtx.textBaseline = 'middle'
      winrateCtx.fillText('Analyze positions to populate graph', w / 2, h / 2)
      return
    }

    const maxIndex = Math.max(2, ...points.map((point) => point.index))
    const xFor = (index) => 20 + ((index - 1) / (maxIndex - 1)) * (w - 40)
    const yFor = (winrate) => h - 18 - Math.max(0, Math.min(1, winrate)) * (h - 36)

    winrateCtx.strokeStyle = '#3b8b82'
    winrateCtx.lineWidth = 5
    winrateCtx.beginPath()
    points.forEach((point, index) => {
      const x = xFor(point.index)
      const y = yFor(point.eval.winrate)
      if (index === 0) winrateCtx.moveTo(x, y)
      else winrateCtx.lineTo(x, y)
    })
    winrateCtx.stroke()

    for (const point of points) {
      const x = xFor(point.index)
      const y = yFor(point.eval.winrate)
      winrateCtx.fillStyle = '#f8f1e8'
      winrateCtx.beginPath()
      winrateCtx.arc(x, y, 6, 0, Math.PI * 2)
      winrateCtx.fill()
    }
  }

  function renderGameTree() {
    gameTreeEl.innerHTML = ''
    const rows = []
    walkTree(state.tree.root, 0, rows)
    for (const row of rows) {
      const node = row.node
      const li = document.createElement('li')
      if (node.id === state.currentNodeId) li.className = 'current'
      li.style.marginLeft = `${Math.min(row.depth, 8) * 14}px`
      li.innerHTML = `
        <span class="nodeMove">${escapeHtml(row.label)}</span>
        <span class="nodeMeta">${node.children.length ? `${node.children.length} branch` : ''}</span>
      `
      li.addEventListener('click', () => {
        state.currentNodeId = node.id
        state.analysis = []
        state.selectedAnalysis = -1
        rebuildPosition()
        state.gameOver = hasConsecutivePasses()
        redrawUi()
        handlePositionChanged({autoRespond: false})
      })
      gameTreeEl.appendChild(li)
    }
  }

  function walkTree(node, depth, rows) {
    if (node.id !== 'root') {
      const moveNumber = pathTo(node.id).length
      const moveText = node.move.isPass ? 'pass' : vertexToGtp(node.move.x, node.move.y)
      rows.push({
        node,
        depth,
        label: `${moveNumber}. ${node.move.color === 'black' ? 'B' : 'W'} ${moveText}`,
      })
    }
    for (const childId of node.children) {
      walkTree(state.tree.nodes[childId], depth + (node.id === 'root' ? 0 : 1), rows)
    }
  }

  function pathTo(nodeId) {
    const path = []
    let node = state.tree.nodes[nodeId]
    while (node && node.move) {
      path.push(node)
      node = state.tree.nodes[node.parent]
    }
    return path.reverse()
  }

  function hasConsecutivePasses() {
    const last = state.line[state.line.length - 1]
    const previous = state.line[state.line.length - 2]
    return Boolean(last && previous && last.isPass && previous.isPass)
  }

  function percent(value) {
    return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '-'
  }

  function analysisLabel(move) {
    return typeof move.winrate === 'number' ? `${Math.round(move.winrate * 100)}%` : move.gtp
  }

  function shortModelName(name) {
    return String(name).replace(/\.bin\.gz$|\.txt\.gz$/i, '')
  }

  function formatBytes(bytes) {
    if (!bytes) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = Number(bytes)
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit++
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
  }

  function selectAnalysis(index) {
    if (!state.analysis[index]) return false
    state.selectedAnalysis = index
    redrawUi()
    return true
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    })[ch])
  }

  function boardPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect()
    const scale = canvas.width / rect.width
    const x = (event.clientX - rect.left) * scale
    const y = (event.clientY - rect.top) * scale
    const {pad, cell} = boardMetrics()
    const bx = Math.round((x - pad) / cell)
    const by = Math.round((y - pad) / cell)
    if (bx < 0 || by < 0 || bx >= size || by >= size) return null
    const dx = Math.abs(x - (pad + bx * cell))
    const dy = Math.abs(y - (pad + by * cell))
    if (Math.max(dx, dy) > cell * 0.45) return null
    return {x: bx, y: by}
  }

  function vertexToGtp(x, y) {
    return `${letters[x]}${size - y}`
  }

  function gtpToPoint(gtp) {
    const match = /^([A-HJ-T])(\d{1,2})$/i.exec(String(gtp).trim())
    if (!match) return null
    const x = letters.indexOf(match[1].toUpperCase())
    const y = size - Number(match[2])
    return x >= 0 && y >= 0 && y < size ? {x, y} : null
  }

  function currentPositionSignature() {
    return [
      `b${size}`,
      `n${state.nextColor === 'white' ? 'w' : 'b'}`,
      ...state.line.map((move) => {
        const color = move.color === 'white' ? 'w' : 'b'
        const x = move.isPass ? -1 : move.x
        const y = move.isPass ? -1 : move.y
        return `${color}:${x},${y}`
      }),
    ].join('|')
  }

  function scheduleAnalyze(delay = 250) {
    clearTimeout(state.autoTimer)
    if (!state.engineOn || state.mode === 'play') return
    if (state.mode === 'online') {
      scheduleOnlineAnalysis(delay)
      return
    }
    state.autoTimer = setTimeout(() => {
      analyze()
    }, delay)
  }

  function scheduleOnlineAnalysis(delay = 50) {
    clearTimeout(state.autoTimer)
    if (state.mode !== 'online' || !state.engineOn || state.gameOver) return
    const positionSignature = currentPositionSignature()
    if ((state.analysisRunning || state.onlineStartInFlight) && state.onlinePositionSignature === positionSignature) return
    state.autoTimer = setTimeout(() => {
      startOnlineAnalysis()
    }, delay)
  }

  async function startOnlineAnalysis() {
    if (state.mode !== 'online' || !state.engineOn || state.gameOver) return []
    const positionSignature = currentPositionSignature()
    if ((state.analysisRunning || state.onlineStartInFlight) && state.onlinePositionSignature === positionSignature) {
      return state.analysis
    }

    clearTimeout(state.autoTimer)
    const streamId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    state.onlineStartInFlight = true
    state.analysisRunning = true
    state.onlineStreamId = streamId
    state.onlinePositionSignature = positionSignature
    state.pendingAnalysisStatus = null
    state.engineEffective = {...(state.engineEffective || {}), totalVisits: null}
    setStatus('Engine online...')
    redrawUi()

    try {
      const response = await callNative('startOnlineAnalysis', {
        streamId,
        boardSize: size,
        nextColor: state.nextColor,
        moves: state.line,
        inference: enginePayload({online: true}),
        callbackPeriod: 0.05,
        firstCallbackAfter: 0.05,
      })
      if (state.onlineStreamId !== streamId) return []
      state.engineEffective = {
        profile: response.profile || state.engineEffective?.profile || '-',
        settings: response.profileSettings || state.engineEffective?.settings || null,
        totalVisits: state.engineEffective?.totalVisits ?? null,
        warnings: response.profileWarnings || [],
      }
      setStatus('Engine online')
      return state.analysis
    } catch (error) {
      if (state.onlineStreamId === streamId) {
        state.analysisRunning = false
        state.onlineStreamId = null
        state.onlinePositionSignature = null
        setStatus(error.message)
      }
      return []
    } finally {
      if (state.onlineStreamId === streamId) {
        state.onlineStartInFlight = false
      }
      redrawUi()
    }
  }

  async function requestAnalysis(statusText, options = {}) {
    if (options.online || state.mode === 'online') {
      return startOnlineAnalysis()
    }
    if (state.busy) {
      state.pendingAnalysisStatus = statusText
      return []
    }
    const online = false
    clearTimeout(state.autoTimer)
    state.busy = true
    state.analysisRunning = true
    const requestToken = ++state.analysisRequestToken
    const generation = state.analysisGeneration
    setStatus(statusText)
    const selectedMove = state.analysis[state.selectedAnalysis]?.gtp || null
    if (!online) {
      state.analysis = []
      state.selectedAnalysis = -1
    }
    state.engineEffective = {...(state.engineEffective || {}), totalVisits: null}
    redrawUi()

    try {
      const response = await callNative('analyze', {
        boardSize: size,
        nextColor: state.nextColor,
        moves: state.line,
        inference: enginePayload({online}),
      })
      if (requestToken !== state.analysisRequestToken || generation !== state.analysisGeneration) {
        setStatus('Engine settings changed; refreshing...')
        return []
      }
      state.analysis = response.moves || []
      state.selectedAnalysis = selectedMove
        ? state.analysis.findIndex((move) => move.gtp === selectedMove)
        : -1
      state.engineEffective = {
        profile: response.profile || state.engineEffective?.profile || '-',
        settings: response.profileSettings || state.engineEffective?.settings || null,
        totalVisits: Number(response.totalVisits || 0),
        warnings: response.profileWarnings || [],
      }
      const node = state.tree.nodes[state.currentNodeId]
      node.eval = state.analysis[0] || node.eval || null
      const elapsed = Number.isFinite(response.elapsedMs) ? ` · ${response.elapsedMs}ms` : ''
      const visits = state.engineEffective.totalVisits ? ` · ${state.engineEffective.totalVisits} visits` : ''
      setStatus(`Analysis ready: ${state.analysis.length} candidates${visits}${elapsed}`)
      return state.analysis
    } catch (error) {
      if (requestToken === state.analysisRequestToken && generation === state.analysisGeneration) {
        setStatus(error.message)
      }
      return []
    } finally {
      state.analysisRunning = false
      state.busy = false
      redrawUi()
      if (state.enginePendingRefresh) {
        setTimeout(() => flushPendingEngineRefresh(), 0)
      } else if (state.pendingAnalysisStatus) {
        const pendingStatus = state.pendingAnalysisStatus
        state.pendingAnalysisStatus = null
        setTimeout(() => requestAnalysis(pendingStatus), 0)
      }
    }
  }

  async function analyze() {
    return requestAnalysis('KataGo analyzing...')
  }

  async function loadHardwareInfo() {
    try {
      const response = await callNative('hardwareInfo', {})
      state.hardwareInfo = response
      redrawUi()
    } catch (_) {}
  }

  async function loadModels() {
    if (state.modelBusy) return
    state.modelBusy = true
    redrawUi()
    try {
      const response = await callNative('listModels', {})
      state.models = response.models || []
      state.modelChoiceId = activeModelId()
    } catch (error) {
      setStatus(error.message)
    } finally {
      state.modelBusy = false
      redrawUi()
    }
  }

  async function openModelSite() {
    try {
      await callNative('openURL', {url: modelSiteUrl})
    } catch (_) {
      window.location.href = modelSiteUrl
    }
  }

  async function importModel() {
    if (state.modelBusy) return
    state.modelBusy = true
    setStatus('Importing model...')
    redrawUi()
    try {
      const response = await callNative('importModel', {})
      state.models = response.models || []
      state.modelChoiceId = response.importedID || activeModelId()
      setStatus('Model imported; select to use')
    } catch (error) {
      setStatus(error.message)
    } finally {
      state.modelBusy = false
      redrawUi()
    }
  }

  async function selectChosenModel() {
    if (!state.modelChoiceId) return
    await selectModel(state.modelChoiceId)
  }

  async function selectModel(id) {
    if (state.modelBusy) return
    state.modelBusy = true
    setStatus('Switching model...')
    redrawUi()
    try {
      const response = await callNative('selectModel', {id})
      state.models = response.models || []
      state.modelChoiceId = activeModelId()
      state.analysis = []
      state.selectedAnalysis = -1
      await resolveEngineProfile({applyToControls: true})
      setStatus('Model selected')
      if (state.engineOn && !state.gameOver && state.mode !== 'play') scheduleAnalyze(0)
    } catch (error) {
      setStatus(error.message)
    } finally {
      state.modelBusy = false
      redrawUi()
    }
  }

  async function deleteModel(id) {
    if (state.modelBusy) return
    state.modelBusy = true
    setStatus('Deleting model...')
    redrawUi()
    try {
      const response = await callNative('deleteModel', {id})
      state.models = response.models || []
      state.modelChoiceId = activeModelId()
      state.analysis = []
      state.selectedAnalysis = -1
      await resolveEngineProfile({applyToControls: true})
      setStatus('Model deleted')
      if (state.engineOn && !state.gameOver && state.mode !== 'play') scheduleAnalyze(0)
    } catch (error) {
      setStatus(error.message)
    } finally {
      state.modelBusy = false
      redrawUi()
    }
  }

  function handlePositionChanged(options = {}) {
    if (state.gameOver) return
    const autoRespond = options.autoRespond !== false
    const autoAnalysis = options.autoAnalyze !== false

    if (state.mode === 'play' && autoRespond && state.nextColor !== state.humanColor) {
      engineReply()
      return
    }

    if (state.engineOn && autoAnalysis) scheduleAnalyze()
  }

  async function engineReply() {
    if (state.engineReplyActive) return
    if (state.busy) {
      state.pendingAnalysisStatus = 'KataGo thinking...'
      return
    }
    state.engineReplyActive = true
    const engineColor = state.nextColor
    try {
      const moves = await requestAnalysis('KataGo thinking...')
      const move = moves[0]
      if (!move || state.nextColor !== engineColor) return
      if (move.isPass || String(move.gtp).toLowerCase() === 'pass') {
        addPass(engineColor, {autoRespond: false, autoAnalyze: false})
        return
      }
      const point = gtpToPoint(move.gtp)
      if (!point) {
        setStatus('KataGo passed')
        return
      }
      if (addMove(point, engineColor, {autoRespond: false, autoAnalyze: false})) {
        state.tree.nodes[state.currentNodeId].eval = move
        setStatus(`KataGo ${vertexToGtp(point.x, point.y)}`)
        redrawUi()
        if (state.engineOn && state.mode !== 'play') scheduleAnalyze(350)
      }
    } finally {
      state.engineReplyActive = false
    }
  }

  function reset(options = {}) {
    stopRunningAnalysis()
    nodeSeq = 1
    state.tree.root = {id: 'root', parent: null, children: [], move: null}
    state.tree.nodes = {root: state.tree.root}
    state.currentNodeId = 'root'
    state.analysis = []
    state.selectedAnalysis = -1
    state.gameOver = false
    rebuildPosition()
    setStatus('New game')
    redrawUi()
    if (!options.silent) handlePositionChanged()
  }

  function undo() {
    if (state.busy || state.currentNodeId === 'root') return
    stopOnlineAnalysisForMove()
    state.currentNodeId = state.tree.nodes[state.currentNodeId].parent
    state.analysis = []
    state.selectedAnalysis = -1
    rebuildPosition()
    state.gameOver = hasConsecutivePasses()
    setStatus('Undo')
    redrawUi()
    handlePositionChanged({autoRespond: false})
  }

  function playSelectedCandidate() {
    const move = state.analysis[state.selectedAnalysis]
    if (!move) return
    if (state.mode === 'play' && state.nextColor !== state.humanColor) {
      engineReply()
      return
    }
    if (move.isPass || String(move.gtp).toLowerCase() === 'pass') {
      addPass(state.nextColor, {autoRespond: state.mode === 'play'})
      return
    }
    const point = gtpToPoint(move.gtp)
    if (addMove(point, state.nextColor, {autoRespond: state.mode === 'play'})) {
      state.tree.nodes[state.currentNodeId].eval = move
      redrawUi()
      if (state.mode !== 'play' && state.engineOn) scheduleAnalyze()
    }
  }

  function exportSgf() {
    const rules = currentRules()
    sgfText.value = `(;GM[1]FF[4]SZ[19]RU[${escapeSgf(rules.label)}]KM[${rules.komi}]${exportChildren(state.tree.root)})`
  }

  function escapeSgf(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
  }

  function exportChildren(node) {
    if (node.children.length === 0) return ''
    if (node.children.length === 1) return exportNode(state.tree.nodes[node.children[0]])
    return node.children.map((id) => `(${exportNode(state.tree.nodes[id])})`).join('')
  }

  function exportNode(node) {
    const prop = node.move.color === 'black' ? 'B' : 'W'
    if (node.move.isPass) return `;${prop}[]${exportChildren(node)}`
    const x = String.fromCharCode(97 + node.move.x)
    const y = String.fromCharCode(97 + node.move.y)
    return `;${prop}[${x}${y}]${exportChildren(node)}`
  }

  function loadSgf() {
    const text = sgfText.value
    const rulesMatch = text.match(/RU\[([^\]]+)\]/i)
    const sgfRules = rulesMatch ? rulesFromSgfLabel(rulesMatch[1]) : null
    if (sgfRules) {
      state.engineSettings.rules = sgfRules.id
      saveEngineSettings()
    }
    reset({silent: true})
    const re = /;([BW])\[([a-s]{2})?\]/gi
    let match
    while ((match = re.exec(text))) {
      const color = match[1].toUpperCase() === 'B' ? 'black' : 'white'
      if (!match[2]) {
        addPass(color, {silent: true})
      } else {
        const x = match[2].charCodeAt(0) - 97
        const y = match[2].charCodeAt(1) - 97
        addMove({x, y}, color, {silent: true})
      }
    }
    setStatus(`Loaded ${state.line.length} moves`)
    redrawUi()
    handlePositionChanged()
  }

  function rulesFromSgfLabel(label) {
    const normalized = String(label).toLowerCase().replace(/\\]/g, ']').replace(/[^a-z]/g, '')
    if (normalized.includes('japanese') || normalized.includes('korean')) return rulePresets.find((rules) => rules.id === 'japanese')
    if (normalized.includes('aga')) return rulePresets.find((rules) => rules.id === 'aga')
    if (normalized.includes('newzealand') || normalized === 'nz') return rulePresets.find((rules) => rules.id === 'new-zealand')
    if (normalized.includes('tromptaylor')) return rulePresets.find((rules) => rules.id === 'tromp-taylor')
    if (normalized.includes('chinese')) return rulePresets.find((rules) => rules.id === 'chinese')
    return null
  }

  function setMode(mode) {
    if (!['review', 'online', 'play'].includes(mode)) mode = 'review'
    clearTimeout(state.autoTimer)
    if (state.busy || state.analysisRunning || state.onlineStartInFlight) stopRunningAnalysis()
    state.mode = mode
    localStorage.setItem('katago.mode', mode)
    if (mode === 'online') {
      state.engineOn = true
      localStorage.setItem('katago.engineOn', 'true')
    }
    invalidateCurrentAnalysis()
    redrawUi()
    if (state.gameOver) return
    if (mode === 'play' && state.nextColor !== state.humanColor) {
      engineReply()
    } else if (state.engineOn) {
      scheduleAnalyze()
    }
  }

  function toggleEngine() {
    if (state.mode === 'play') return
    state.engineOn = !state.engineOn
    localStorage.setItem('katago.engineOn', String(state.engineOn))
    clearTimeout(state.autoTimer)
    if (!state.engineOn) {
      stopRunningAnalysis()
      setStatus('Engine off')
    }
    redrawUi()
    if (state.engineOn && !state.gameOver) scheduleAnalyze(0)
  }

  function setHumanColor(color) {
    state.humanColor = color
    localStorage.setItem('katago.humanColor', color)
    redrawUi()
    if (state.gameOver) return
    if (state.mode === 'play' && state.nextColor !== state.humanColor) {
      engineReply()
    } else if (state.engineOn) {
      scheduleAnalyze(0)
    }
  }

  function passMove() {
    if (state.gameOver) {
      setStatus('Game over')
      return
    }
    if (state.mode === 'play' && state.nextColor !== state.humanColor) {
      setStatus('KataGo to move')
      return
    }
    addPass(state.nextColor, {autoRespond: state.mode === 'play'})
  }

  function resignGame() {
    if (state.gameOver) return
    state.gameOver = true
    clearTimeout(state.autoTimer)
    stopRunningAnalysis()
    const winner = otherColor(state.nextColor)
    setStatus(`${colorName(state.nextColor)} resigned. ${colorName(winner)} wins`)
    redrawUi()
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    if (state.gameOver) {
      setStatus('Game over')
      return
    }
    if (state.mode === 'play' && state.nextColor !== state.humanColor) {
      setStatus('KataGo to move')
      return
    }
    addMove(boardPointFromEvent(event))
  })
  modeReviewButton.addEventListener('click', () => setMode('review'))
  modeOnlineButton.addEventListener('click', () => setMode('online'))
  modePlayButton.addEventListener('click', () => setMode('play'))
  engineToggleButton.addEventListener('click', toggleEngine)
  rulesButton.addEventListener('click', cycleRules)
  humanBlackButton.addEventListener('click', () => setHumanColor('black'))
  humanWhiteButton.addEventListener('click', () => setHumanColor('white'))
  engineFastButton.addEventListener('click', () => setEnginePreset('fast'))
  engineBalancedButton.addEventListener('click', () => setEnginePreset('balanced'))
  engineStrongButton.addEventListener('click', () => setEnginePreset('strong'))
  for (const control of engineControls) {
    control.element.addEventListener('change', () => setEngineControl(control.key, control.element.value))
    if (control.kind === 'number') {
      control.element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        control.element.blur()
      })
    }
  }
  modelSelectEl.addEventListener('change', () => {
    state.modelChoiceId = modelSelectEl.value
    updateModelSelectState()
  })
  selectModelButton.addEventListener('click', selectChosenModel)
  openModelSiteButton.addEventListener('click', openModelSite)
  importModelButton.addEventListener('click', importModel)
  refreshModelsButton.addEventListener('click', loadModels)
  showLicensesButton.addEventListener('click', showLicenses)
  modalCloseButton.addEventListener('click', hideModal)
  modalBackdrop.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) hideModal()
  })
  document.getElementById('newGame').addEventListener('click', () => reset())
  document.getElementById('undo').addEventListener('click', undo)
  passButton.addEventListener('click', passMove)
  resignButton.addEventListener('click', resignGame)
  document.getElementById('playCandidate').addEventListener('click', playSelectedCandidate)
  document.getElementById('exportSgf').addEventListener('click', exportSgf)
  document.getElementById('loadSgf').addEventListener('click', loadSgf)

  fillEngineControls()
  rebuildPosition()
  redrawUi()
  loadHardwareInfo()
  loadModels().then(() => resolveEngineProfile({applyToControls: true}))
  setTimeout(() => handlePositionChanged(), 600)
})()
