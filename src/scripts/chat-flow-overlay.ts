interface FlowEnvelope {
  hyperChatFlow?: boolean;
  type?: string;
  payload?: unknown;
}

interface FlowBridgeMessage {
  type?: string;
  eventType?: string;
  payload?: unknown;
}

interface FlowMessage {
  id: string;
  author: string;
  text: string;
  runs: FlowRun[];
  avatar?: string;
  stickerUrl?: string;
  amount?: string;
  backgroundColor?: string;
  isSuper: boolean;
  sourceTimestampMs?: number;
  receivedAtMs?: number;
  enqueuedAtMs?: number;
}

type FlowRun =
  | { type: 'text'; text: string }
  | { type: 'emoji'; src: string; alt: string };

interface FlowSettings {
  enabled: boolean;
  fontSize: number;
  displayMs: number;
  lanes: number;
  opacity: number;
  maxPerSecond: number;
  showAuthor: boolean;
  showAvatar: boolean;
  superScale: number;
  maxVisible: number;
  areaTopPercent: number;
  areaHeightPercent: number;
  maxDelayMs: number;
}

const SETTINGS_KEY = 'hc.flowOverlay.enabled';
const SETTINGS_MAX_VISIBLE_KEY = 'hc.flowOverlay.maxVisible';
const SETTINGS_AREA_TOP_KEY = 'hc.flowOverlay.areaTopPercent';
const SETTINGS_AREA_HEIGHT_KEY = 'hc.flowOverlay.areaHeightPercent';
const SETTINGS_MAX_PER_SECOND_KEY = 'hc.flowOverlay.maxPerSecond';
const SETTINGS_MAX_DELAY_MS_KEY = 'hc.flowOverlay.maxDelayMs';
const DEBUG_PREFIX = '[HC Flow]';
const debugBuffer: string[] = [];
const debugBufferMax = 5000;

const log = (...args: any[]): void => {
  const line = `${new Date().toISOString()} ${args.map((v) => {
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }).join(' ')}`;
  debugBuffer.push(line);
  if (debugBuffer.length > debugBufferMax) debugBuffer.shift();
  console.info(DEBUG_PREFIX, ...args);
};

const settings: FlowSettings = {
  enabled: true,
  fontSize: 28,
  displayMs: 5000,
  lanes: 12,
  opacity: 0.9,
  maxPerSecond: 12,
  showAuthor: false,
  showAvatar: true,
  superScale: 1.35,
  maxVisible: 24,
  areaTopPercent: 8,
  areaHeightPercent: 72,
  maxDelayMs: 12000
};

const fixUrl = (url: string | undefined): string => {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${location.protocol}//${location.host}${url}`;
  return url;
};

const parseRuns = (runs: Ytc.MessageRun[] | undefined): FlowRun[] => {
  if (!runs) return [];
  const parsed: FlowRun[] = [];
  runs.forEach((run) => {
    if (run.text) {
      parsed.push({ type: 'text', text: run.text });
      return;
    }

    if (run.emoji) {
      const src = fixUrl(run.emoji.image.thumbnails?.[0]?.url);
      const alt = run.emoji.image.accessibility?.accessibilityData.label ?? run.emoji.emojiId ?? 'emoji';
      if (src) {
        parsed.push({ type: 'emoji', src, alt });
      } else if (alt) {
        parsed.push({ type: 'text', text: alt });
      }
    }
  });
  return parsed;
};

const runsToText = (runs: FlowRun[]): string =>
  runs
    .map((run) => (run.type === 'text' ? run.text : run.alt))
    .join('')
    .trim();

const numberToColor = (color: number | undefined): string | undefined => {
  if (color == null) return undefined;
  return '#' + (color & 0xFFFFFF).toString(16).padStart(6, '0');
};

const readFlowMessage = (item: Ytc.AddChatItem): FlowMessage | null => {
  const renderer =
    item.liveChatTextMessageRenderer ??
    item.liveChatPaidMessageRenderer ??
    item.liveChatPaidStickerRenderer ??
    item.liveChatMembershipItemRenderer ??
    item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer;
  if (!renderer) return null;

  const isGift = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer != null;
  const baseRenderer: Ytc.TextMessageRenderer | undefined = isGift
    ? item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer?.header.liveChatSponsorshipsHeaderRenderer
    : renderer as Ytc.TextMessageRenderer;
  if (!baseRenderer) return null;

  const author = baseRenderer.authorName?.simpleText ?? '';
  const avatar = fixUrl(baseRenderer.authorPhoto?.thumbnails?.[0]?.url);
  const runs = parseRuns(baseRenderer.message?.runs);
  const text = runsToText(runs);
  const superRenderer = item.liveChatPaidMessageRenderer;
  const stickerRenderer = item.liveChatPaidStickerRenderer;
  const stickerUrl = fixUrl(stickerRenderer?.sticker?.thumbnails?.[0]?.url);

  const isSuper = superRenderer != null || stickerRenderer != null;
  const amount = superRenderer?.purchaseAmountText.simpleText ??
    stickerRenderer?.purchaseAmountText.simpleText;
  const timestampUsec = Number(baseRenderer.timestampUsec ?? renderer.timestampUsec ?? 0);
  const sourceTimestampMs = Number.isFinite(timestampUsec) && timestampUsec > 0
    ? Math.floor(timestampUsec / 1000)
    : undefined;
  const backgroundColor = numberToColor(
    superRenderer?.headerBackgroundColor ?? stickerRenderer?.moneyChipBackgroundColor
  );

  if (!text && !amount && !stickerUrl) return null;

  return {
    id: renderer.id ?? `flow_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    author,
    text: text || amount || '',
    runs,
    avatar,
    stickerUrl,
    amount,
    backgroundColor,
    isSuper,
    sourceTimestampMs
  };
};

const parsePayloadToMessages = (payload: unknown): FlowMessage[] => {
  const messages: FlowMessage[] = [];
  let json: Ytc.RawResponse | null = null;
  if (typeof payload === 'string') {
    try {
      json = JSON.parse(payload);
    } catch {
      return messages;
    }
  } else if (payload && typeof payload === 'object') {
    json = payload as Ytc.RawResponse;
  }
  if (!json) return messages;

  const base = json.continuationContents?.liveChatContinuation ?? json.contents?.liveChatRenderer;
  const actions = base?.actions;
  if (!actions) return messages;

  actions.forEach((action) => {
    if (action.addChatItemAction) {
      const parsed = readFlowMessage(action.addChatItemAction.item);
      if (parsed) messages.push(parsed);
      return;
    }
    if (action.replayChatItemAction) {
      action.replayChatItemAction.actions.forEach((replayAction) => {
        if (!replayAction.addChatItemAction) return;
        const parsed = readFlowMessage(replayAction.addChatItemAction.item);
        if (parsed) messages.push(parsed);
      });
    }
  });

  return messages;
};

class PerSecondLimiter {
  private count = 0;
  private resetAt = Date.now() + 1000;

  public isOver(limit: number): boolean {
    if (limit <= 0) return false;
    const now = Date.now();
    if (now >= this.resetAt) {
      this.count = 0;
      this.resetAt = now + 1000;
    }
    this.count += 1;
    return this.count > limit;
  }
}

class FlowOverlay {
  private container: HTMLDivElement | null = null;
  private host: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private toggleButton: HTMLButtonElement | null = null;
  private queue: FlowMessage[] = [];
  private laneUntil: number[] = [];
  private renderedIds: Set<string> = new Set();
  private processTimer: number | null = null;
  private ensureTimer: number | null = null;
  private limiter = new PerSecondLimiter();
  private forwardedCount = 0;
  private queuedCount = 0;
  private renderedCount = 0;
  private statsTimer: number | null = null;
  private lastReceivedBatchAtMs: number | null = null;
  private receivedSinceLastStats = 0;
  private renderedSinceLastStats = 0;
  private preferRuntimeBridge = false;
  private lastRuntimeBridgeAtMs: number | null = null;
  private recentBatchFingerprints = new Map<string, number>();
  private nextRenderAtMs = 0;
  private adaptiveIntervalMs = 120;
  private droppedStaleCount = 0;

  public async init(): Promise<void> {
    this.injectStyle();
    await this.loadSetting();
    this.watchSetting();
    this.bindEvents();
    this.ensureReady();
    this.ensureTimer = window.setInterval(() => this.ensureReady(), 1500);
    this.processTimer = window.setInterval(() => this.processQueue(), 80);
    this.statsTimer = window.setInterval(() => this.logStatsTick(), 1000);
    log('initialized', { enabled: settings.enabled });
  }

  private async loadSetting(): Promise<void> {
    const keys = [
      SETTINGS_KEY,
      SETTINGS_MAX_VISIBLE_KEY,
      SETTINGS_AREA_TOP_KEY,
      SETTINGS_AREA_HEIGHT_KEY,
      SETTINGS_MAX_PER_SECOND_KEY,
      SETTINGS_MAX_DELAY_MS_KEY
    ];
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(keys),
      chrome.storage.local.get(keys)
    ]);
    const merged = { ...localResult, ...syncResult };
    settings.enabled = merged[SETTINGS_KEY] ?? true;
    settings.maxVisible = this.clampInt(merged[SETTINGS_MAX_VISIBLE_KEY], 24, 1, 80);
    settings.areaTopPercent = this.clampInt(merged[SETTINGS_AREA_TOP_KEY], 8, 0, 90);
    settings.areaHeightPercent = this.clampInt(merged[SETTINGS_AREA_HEIGHT_KEY], 72, 10, 100);
    settings.maxPerSecond = this.clampInt(merged[SETTINGS_MAX_PER_SECOND_KEY], 12, 1, 60);
    settings.maxDelayMs = this.clampInt(merged[SETTINGS_MAX_DELAY_MS_KEY], 12000, 1000, 60000);
    this.fixAreaBounds();
    this.updateToggleButtonLabel();
    log('settings loaded', {
      enabled: settings.enabled,
      maxVisible: settings.maxVisible,
      areaTopPercent: settings.areaTopPercent,
      areaHeightPercent: settings.areaHeightPercent,
      maxPerSecond: settings.maxPerSecond,
      maxDelayMs: settings.maxDelayMs
    });
  }

  private watchSetting(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' && area !== 'local') return;
      let changedAny = false;
      if (changes[SETTINGS_KEY]) {
        settings.enabled = changes[SETTINGS_KEY].newValue ?? true;
        changedAny = true;
      }
      if (changes[SETTINGS_MAX_VISIBLE_KEY]) {
        settings.maxVisible = this.clampInt(changes[SETTINGS_MAX_VISIBLE_KEY].newValue, 24, 1, 80);
        changedAny = true;
      }
      if (changes[SETTINGS_AREA_TOP_KEY]) {
        settings.areaTopPercent = this.clampInt(changes[SETTINGS_AREA_TOP_KEY].newValue, 8, 0, 90);
        changedAny = true;
      }
      if (changes[SETTINGS_AREA_HEIGHT_KEY]) {
        settings.areaHeightPercent = this.clampInt(changes[SETTINGS_AREA_HEIGHT_KEY].newValue, 72, 10, 100);
        changedAny = true;
      }
      if (changes[SETTINGS_MAX_PER_SECOND_KEY]) {
        settings.maxPerSecond = this.clampInt(changes[SETTINGS_MAX_PER_SECOND_KEY].newValue, 12, 1, 60);
        changedAny = true;
      }
      if (changes[SETTINGS_MAX_DELAY_MS_KEY]) {
        settings.maxDelayMs = this.clampInt(changes[SETTINGS_MAX_DELAY_MS_KEY].newValue, 12000, 1000, 60000);
        changedAny = true;
      }
      if (!changedAny) return;
      this.fixAreaBounds();
      this.applyOverlayLayout();
      this.updateToggleButtonLabel();
      log('settings changed', {
        enabled: settings.enabled,
        areaTopPercent: settings.areaTopPercent,
        areaHeightPercent: settings.areaHeightPercent,
        maxVisible: settings.maxVisible,
        maxPerSecond: settings.maxPerSecond,
        maxDelayMs: settings.maxDelayMs,
        area
      });
      if (!settings.enabled) {
        this.clear();
      }
    });
  }

  private consume(eventType: string | undefined, payload: unknown, source: string): void {
    if (eventType !== 'messageReceive') return;
    const now = Date.now();
    if (source === 'runtimeBridge') {
      this.preferRuntimeBridge = true;
      this.lastRuntimeBridgeAtMs = now;
    }
    if (source === 'postMessage' && this.preferRuntimeBridge) {
      const runtimeBridgeAlive = this.lastRuntimeBridgeAtMs != null && (now - this.lastRuntimeBridgeAtMs) < 5000;
      if (runtimeBridgeAlive) {
        return;
      }
      log('runtimeBridge-timeout-fallback-to-postMessage', {
        silenceMs: this.lastRuntimeBridgeAtMs == null ? null : now - this.lastRuntimeBridgeAtMs
      });
    }

    this.forwardedCount += 1;
    const parsed = parsePayloadToMessages(payload);
    if (parsed.length > 0) {
      const fingerprint = this.buildBatchFingerprint(parsed);
      const lastSeen = this.recentBatchFingerprints.get(fingerprint);
      if (lastSeen != null && now - lastSeen < 1500) {
        log('received-batch-duplicate-skipped', { source, parsed: parsed.length, ageMs: now - lastSeen });
        return;
      }
      this.recentBatchFingerprints.set(fingerprint, now);
      this.sweepBatchFingerprints(now);
    }
    parsed.forEach((msg) => { msg.receivedAtMs = now; });
    if (parsed.length > 0) {
      const gapMs = this.lastReceivedBatchAtMs == null ? null : now - this.lastReceivedBatchAtMs;
      this.lastReceivedBatchAtMs = now;
      this.receivedSinceLastStats += parsed.length;
      this.updateAdaptiveInterval(parsed.length, gapMs);
      log('received-batch', {
        source,
        forwarded: this.forwardedCount,
        parsed: parsed.length,
        gapMs
      });
    }
    parsed.forEach(msg => this.enqueue(msg));
  }

  private buildBatchFingerprint(messages: FlowMessage[]): string {
    const first = messages[0];
    const last = messages[messages.length - 1];
    return [
      messages.length,
      first?.id ?? '',
      last?.id ?? '',
      first?.sourceTimestampMs ?? '',
      last?.sourceTimestampMs ?? ''
    ].join('|');
  }

  private sweepBatchFingerprints(now: number): void {
    for (const [key, seenAt] of this.recentBatchFingerprints.entries()) {
      if (now - seenAt > 5000) this.recentBatchFingerprints.delete(key);
    }
  }

  private bindEvents(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      const data = event.data as FlowEnvelope;
      if (!data?.hyperChatFlow) return;
      this.consume(data.type, data.payload, 'postMessage');
    });

    chrome.runtime.onMessage.addListener((message: FlowBridgeMessage) => {
      if (message?.type !== 'hcFlowBridge') return;
      this.consume(message.eventType, message.payload, 'runtimeBridge');
    });

    document.addEventListener('yt-navigate-finish', () => {
      log('yt-navigate-finish');
      this.clear();
      this.video = null;
      this.host = null;
      this.container?.remove();
      this.container = null;
      this.ensureReady();
    });
  }

  private pickHost(): HTMLElement | null {
    const candidates = [
      document.querySelector<HTMLElement>('.html5-video-container'),
      document.querySelector<HTMLElement>('.html5-video-player'),
      document.querySelector<HTMLElement>('#movie_player'),
      this.video?.parentElement as HTMLElement | null
    ].filter((el): el is HTMLElement => el != null);

    let best: HTMLElement | null = null;
    let bestArea = 0;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  private syncContainerSize(): void {
    if (!this.container || !this.video) return;
    const videoRect = this.video.getBoundingClientRect();
    const width = Math.max(0, Math.floor(videoRect.width));
    const height = Math.max(0, Math.floor(videoRect.height));
    if (width > 0) this.container.style.width = `${width}px`;
    if (height > 0) {
      const areaTopPx = Math.floor((height * settings.areaTopPercent) / 100);
      const areaHeightPx = Math.max(24, Math.floor((height * settings.areaHeightPercent) / 100));
      this.container.style.top = `${areaTopPx}px`;
      this.container.style.height = `${areaHeightPx}px`;
    }
  }

  private ensureReady(): void {
    if (!this.video || !this.video.isConnected) {
      this.video = document.querySelector('video.html5-main-video');
      if (!this.video) return;
      log('video element attached');
      this.video.addEventListener('pause', () => this.pauseAnimations());
      this.video.addEventListener('play', () => this.playAnimations());
      window.addEventListener('resize', () => this.syncContainerSize());
    }
    this.ensureToggleButton();
    if (!settings.enabled) return;
    if (this.container?.isConnected) {
      this.syncContainerSize();
      return;
    }

    const parent = this.pickHost();
    if (!parent) return;

    const parentElement = parent as HTMLElement;
    const computed = window.getComputedStyle(parentElement);
    if (computed.position === 'static') {
      parentElement.style.position = 'relative';
    }
    this.host = parentElement;

    const div = document.createElement('div');
    div.className = 'hc-flow-overlay';
    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.zIndex = '9999';
    div.style.pointerEvents = 'none';
    div.style.overflow = 'hidden';
    parentElement.appendChild(div);
    this.container = div;
    this.syncContainerSize();
    this.applyOverlayLayout();
    log('overlay container attached', {
      width: div.clientWidth,
      height: div.clientHeight,
      parent: parentElement.className
    });
  }

  private enqueue(message: FlowMessage): void {
    if (!settings.enabled) return;
    if (this.renderedIds.has(message.id)) return;
    message.enqueuedAtMs = Date.now();
    this.renderedIds.add(message.id);
    this.queue.push(message);
    this.queuedCount += 1;
    if (this.queue.length > 200) this.queue.shift();
  }

  private processQueue(): void {
    if (!settings.enabled || !this.container || !this.video) return;
    const now = Date.now();
    if (now < this.nextRenderAtMs) return;
    let next = this.queue.shift();
    while (next && this.isStaleMessage(next, now)) {
      this.droppedStaleCount += 1;
      if (this.droppedStaleCount % 10 === 0) {
        log('stale-queue-dropped', {
          dropped: this.droppedStaleCount,
          queueLength: this.queue.length,
          maxDelayMs: settings.maxDelayMs
        });
      }
      next = this.queue.shift();
    }
    if (!next) return;
    if (this.limiter.isOver(settings.maxPerSecond)) {
      this.queue.unshift(next);
      return;
    }
    this.render(next);
    this.nextRenderAtMs = now + this.adaptiveIntervalMs;
  }

  private isStaleMessage(message: FlowMessage, now: number): boolean {
    const baseline = message.receivedAtMs ?? message.enqueuedAtMs;
    if (baseline == null) return false;
    return now - baseline > settings.maxDelayMs;
  }

  private render(message: FlowMessage): void {
    if (!this.container || !this.video) return;
    if (this.container.clientWidth < 8 || this.container.clientHeight < 8) {
      this.syncContainerSize();
      log('render skipped: container has no size', {
        width: this.container.clientWidth,
        height: this.container.clientHeight
      });
      this.queue.unshift(message);
      if (this.queue.length > 200) this.queue.pop();
      return;
    }

    const item = document.createElement('div');
    item.className = 'hc-flow-item';

    const scale = message.isSuper ? settings.superScale : 1;
    item.style.fontSize = `${Math.floor(settings.fontSize * scale)}px`;
    item.style.opacity = `${settings.opacity}`;
    if (message.backgroundColor) {
      item.style.backgroundColor = message.backgroundColor;
      item.style.padding = '4px 10px';
      item.style.borderRadius = '6px';
    }

    if (settings.showAvatar && message.avatar) {
      const img = document.createElement('img');
      img.className = 'hc-flow-avatar';
      img.src = message.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      item.appendChild(img);
    }

    const textWrap = document.createElement('span');
    textWrap.className = 'hc-flow-text';

    if (settings.showAuthor && message.author) {
      const author = document.createElement('span');
      author.className = 'hc-flow-author';
      author.textContent = `${message.author}: `;
      textWrap.appendChild(author);
    }

    if (message.runs.length > 0) {
      message.runs.forEach((run) => {
        if (run.type === 'text') {
          const span = document.createElement('span');
          span.textContent = run.text;
          textWrap.appendChild(span);
          return;
        }

        const emoji = document.createElement('img');
        emoji.className = 'hc-flow-emoji';
        emoji.src = run.src;
        emoji.alt = run.alt;
        emoji.referrerPolicy = 'no-referrer';
        textWrap.appendChild(emoji);
      });
    } else {
      const span = document.createElement('span');
      span.textContent = message.text;
      textWrap.appendChild(span);
    }

    item.appendChild(textWrap);

    if (message.stickerUrl) {
      const sticker = document.createElement('img');
      sticker.className = 'hc-flow-sticker';
      sticker.src = message.stickerUrl;
      sticker.alt = 'sticker';
      sticker.referrerPolicy = 'no-referrer';
      item.appendChild(sticker);
    }

    if (message.amount) {
      const amount = document.createElement('span');
      amount.className = 'hc-flow-amount';
      amount.textContent = ` ${message.amount}`;
      item.appendChild(amount);
    }

    this.container.appendChild(item);
    this.trimVisibleOverflow();

    const laneHeight = Math.max(this.container.clientHeight / settings.lanes, 24);
    const lane = this.pickLane();
    const top = (lane * laneHeight) + 4;
    item.style.top = `${top}px`;

    const containerWidth = this.container.clientWidth;
    const itemWidth = item.clientWidth;
    const duration = settings.displayMs;
    const speed = (containerWidth + itemWidth) / duration;
    this.laneUntil[lane] = Date.now() + Math.max(300, (itemWidth + 40) / speed);

    const animation = item.animate([
      { transform: `translateX(${containerWidth}px)` },
      { transform: `translateX(-${itemWidth}px)` }
    ], {
      duration,
      easing: 'linear',
      fill: 'forwards'
    });
    animation.onfinish = () => item.remove();

    if (this.video.paused) animation.pause();
    this.renderedCount += 1;
    this.renderedSinceLastStats += 1;

    if (this.renderedCount % 25 === 0) {
      const now = Date.now();
      const queueDelayMs = message.enqueuedAtMs == null ? null : now - message.enqueuedAtMs;
      const sourceDelayMs = message.sourceTimestampMs == null ? null : now - message.sourceTimestampMs;
      log('render-sample', {
        rendered: this.renderedCount,
        queueLength: this.queue.length,
        queueDelayMs,
        sourceDelayMs
      });
    }
  }

  private logStatsTick(): void {
    if (!settings.enabled) return;
    log('stats', {
      queueLength: this.queue.length,
      receivedPerSec: this.receivedSinceLastStats,
      renderedPerSec: this.renderedSinceLastStats
    });
    this.receivedSinceLastStats = 0;
    this.renderedSinceLastStats = 0;
  }

  private pickLane(): number {
    const now = Date.now();
    if (this.laneUntil.length !== settings.lanes) {
      this.laneUntil = Array(settings.lanes).fill(0);
    }

    for (let i = 0; i < this.laneUntil.length; i++) {
      if (this.laneUntil[i] <= now) return i;
    }

    let minIdx = 0;
    for (let i = 1; i < this.laneUntil.length; i++) {
      if (this.laneUntil[i] < this.laneUntil[minIdx]) minIdx = i;
    }
    return minIdx;
  }

  private pauseAnimations(): void {
    this.container?.querySelectorAll('.hc-flow-item').forEach((item) => {
      item.getAnimations().forEach(anim => anim.pause());
    });
  }

  private playAnimations(): void {
    this.container?.querySelectorAll('.hc-flow-item').forEach((item) => {
      item.getAnimations().forEach(anim => anim.play());
    });
  }

  private clear(): void {
    this.queue = [];
    this.renderedIds.clear();
    this.laneUntil = [];
    this.nextRenderAtMs = 0;
    this.container?.querySelectorAll('.hc-flow-item').forEach((item) => item.remove());
    log('overlay cleared');
  }

  private clampInt(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  private fixAreaBounds(): void {
    if (settings.areaTopPercent + settings.areaHeightPercent > 100) {
      settings.areaHeightPercent = Math.max(10, 100 - settings.areaTopPercent);
    }
  }

  private applyOverlayLayout(): void {
    this.syncContainerSize();
  }

  private ensureToggleButton(): void {
    const player = document.querySelector<HTMLElement>('#movie_player');
    if (!player) return;
    const controls = player.querySelector<HTMLElement>('.ytp-right-controls');
    if (!controls) return;

    if (this.toggleButton?.isConnected) {
      this.updateToggleButtonLabel();
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hc-flow-toggle-button';
    button.title = 'Toggle HyperChat flow';
    button.addEventListener('click', () => {
      const nextEnabled = !settings.enabled;
      settings.enabled = nextEnabled;
      this.updateToggleButtonLabel();
      this.applyOverlayLayout();
      if (!nextEnabled) {
        this.clear();
      } else {
        this.ensureReady();
      }
      void this.persistEnabled(nextEnabled);
      log('player-toggle-clicked', { enabled: nextEnabled });
    });

    controls.insertBefore(button, controls.firstChild);
    this.toggleButton = button;
    this.updateToggleButtonLabel();
    log('player toggle attached');
  }

  private updateToggleButtonLabel(): void {
    if (!this.toggleButton) return;
    this.toggleButton.textContent = settings.enabled ? 'Flow ON' : 'Flow OFF';
    this.toggleButton.classList.toggle('is-off', !settings.enabled);
  }

  private async persistEnabled(enabled: boolean): Promise<void> {
    const payload = { [SETTINGS_KEY]: enabled };
    try {
      await chrome.storage.sync.set(payload);
    } catch (error) {
      log('persist sync failed', { error: String(error) });
    }
    try {
      await chrome.storage.local.set(payload);
    } catch (error) {
      log('persist local failed', { error: String(error) });
    }
  }

  private trimVisibleOverflow(): void {
    if (!this.container) return;
    const items = this.container.querySelectorAll<HTMLElement>('.hc-flow-item');
    const overflow = items.length - settings.maxVisible;
    if (overflow <= 0) return;
    for (let i = 0; i < overflow; i += 1) {
      items[i]?.remove();
    }
  }

  private updateAdaptiveInterval(parsedCount: number, gapMs: number | null): void {
    if (parsedCount <= 0) return;
    const minInterval = Math.max(16, Math.floor(1000 / Math.max(1, settings.maxPerSecond)));
    const maxInterval = 1200;
    if (gapMs == null || gapMs <= 0) {
      this.adaptiveIntervalMs = minInterval;
      return;
    }
    const estimated = Math.floor(gapMs / parsedCount);
    const clamped = Math.min(maxInterval, Math.max(minInterval, estimated));
    this.adaptiveIntervalMs = Math.floor((this.adaptiveIntervalMs * 0.6) + (clamped * 0.4));
    log('adaptive-interval-updated', {
      parsedCount,
      gapMs,
      intervalMs: this.adaptiveIntervalMs
    });
  }

  private injectStyle(): void {
    if (document.getElementById('hc-flow-style')) return;
    const style = document.createElement('style');
    style.id = 'hc-flow-style';
    style.textContent = `
      .hc-flow-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 9999;
      }
      .hc-flow-item {
        position: absolute;
        left: 0;
        max-width: 75%;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        color: #fff;
        font-weight: 700;
        text-shadow:
          -2px -2px 2px rgba(0, 0, 0, 0.9),
          2px -2px 2px rgba(0, 0, 0, 0.9),
          -2px 2px 2px rgba(0, 0, 0, 0.9),
          2px 2px 2px rgba(0, 0, 0, 0.9);
        will-change: transform;
      }
      .hc-flow-avatar {
        width: 1.2em;
        height: 1.2em;
        border-radius: 50%;
        margin-right: 0.35em;
        object-fit: cover;
      }
      .hc-flow-text {
        display: inline-flex;
        align-items: center;
      }
      .hc-flow-author {
        white-space: pre;
      }
      .hc-flow-emoji {
        width: 1.15em;
        height: 1.15em;
        object-fit: contain;
        vertical-align: middle;
      }
      .hc-flow-sticker {
        height: 1.6em;
        width: auto;
        object-fit: contain;
        margin-left: 0.35em;
        border-radius: 4px;
      }
      .hc-flow-amount {
        margin-left: 0.35em;
        font-weight: 800;
      }
      .hc-flow-toggle-button {
        margin-left: 8px;
        min-width: 74px;
        height: 24px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.62);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        padding: 0 10px;
      }
      .hc-flow-toggle-button:hover {
        background: rgba(0, 0, 0, 0.78);
      }
      .hc-flow-toggle-button.is-off {
        color: #ffb3b3;
        border-color: rgba(255, 130, 130, 0.55);
      }
    `;
    document.head.appendChild(style);
  }

  public destroy(): void {
    if (this.processTimer != null) window.clearInterval(this.processTimer);
    if (this.ensureTimer != null) window.clearInterval(this.ensureTimer);
    if (this.statsTimer != null) window.clearInterval(this.statsTimer);
    this.clear();
    this.container?.remove();
    this.toggleButton?.remove();
    this.toggleButton = null;
  }

  public getDebugState(): Record<string, unknown> {
    return {
      enabled: settings.enabled,
      hasVideo: !!this.video,
      hasContainer: !!this.container,
      queueLength: this.queue.length,
      forwardedCount: this.forwardedCount,
      queuedCount: this.queuedCount,
      renderedCount: this.renderedCount,
      droppedStaleCount: this.droppedStaleCount,
      adaptiveIntervalMs: this.adaptiveIntervalMs,
      maxVisible: settings.maxVisible,
      areaTopPercent: settings.areaTopPercent,
      areaHeightPercent: settings.areaHeightPercent,
      maxDelayMs: settings.maxDelayMs
    };
  }
}

const controller = new FlowOverlay();
controller.init().catch(console.error);
(window as any).hcFlowDebug = () => controller.getDebugState();
(window as any).hcFlowGetLogs = () => debugBuffer.join('\n');
(window as any).hcFlowDownloadLogs = () => {
  const blob = new Blob([debugBuffer.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hc-flow-${Date.now()}.log.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};

export {};
