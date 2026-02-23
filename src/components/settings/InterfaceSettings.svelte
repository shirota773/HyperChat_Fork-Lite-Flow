<script lang="ts">
  import {
    theme,
    showOnlyMemberChat,
    showProfileIcons,
    showTimestamps,
    showUsernames,
    showUserBadges,
    emojiRenderMode,
    autoLiveChat,
    useSystemEmojis,
    isDark,
    enableStickySuperchatBar,
    enableHighlightedMentions,
    showChatSummary,
    enableVideoFlowOverlay,
    flowOverlayMaxVisible,
    flowOverlayAreaTopPercent,
    flowOverlayAreaHeightPercent,
    flowOverlayMaxPerSecond,
    flowOverlayMaxDelayMs
  } from '../../ts/storage';
  import { themeItems, emojiRenderItems } from '../../ts/chat-constants';
  import Card from '../common/Card.svelte';
  import Radio from '../common/RadioGroupStore.svelte';
  import Checkbox from '../common/CheckboxStore.svelte';
  import Icon from '../common/Icon.svelte';
  import dark from 'smelte/src/dark';
  import MessageTranslationSettings from './MessageTranslationSettings.svelte';

  const willChangeOnNextChunkMessage = (
    'Settings listed below will take effect when the next chat message chunk arrives.'
  );

  const darkStore = dark();
  $: darkStore.set($isDark);

  $: console.debug({
    theme: $theme,
    showProfileIcons: $showProfileIcons,
    showTimestamps: $showTimestamps,
    showUsernames: $showUsernames
  });

  const superchatBarWasDisabled = !$enableStickySuperchatBar;
  let superchatBarWasToggled: boolean | null = null;
  const updateSuperchatBarToggle = () => {
    superchatBarWasToggled = superchatBarWasToggled !== null;
  };
  $: $enableStickySuperchatBar, updateSuperchatBarToggle();
</script>

<Card title="Appearance" icon="format_paint">
  <div class="flex items-center gap-2">
    <h6>Theme:</h6>
    <Radio store={theme} items={themeItems} />
  </div>
  <Checkbox name="Enable sticky superchat bar" store={enableStickySuperchatBar} />
  {#if (superchatBarWasToggled ?? superchatBarWasDisabled) && $enableStickySuperchatBar}
    <i>The superchat bar will appear upon reload or when the next superchat arrives.</i>
  {/if}
</Card>

<Card title="Messages" icon="message">
  <Checkbox name="Show profile icons" store={showProfileIcons} />
  <Checkbox name="Show timestamps" store={showTimestamps} />
  <Checkbox name="Show usernames" store={showUsernames} />
  <Checkbox name="Show user badges" store={showUserBadges} />
  <Checkbox name="Show experimental chat summaries by YouTube" store={showChatSummary} />
  <Checkbox name="Highlight mentions" store={enableHighlightedMentions} />
</Card>

<Card title="Emojis" icon="emoji_emotions">
  <Checkbox name="Use system emojis when possible" store={useSystemEmojis} />
  <i>{willChangeOnNextChunkMessage}</i>
  <Radio store={emojiRenderMode} items={emojiRenderItems} vertical />
</Card>

<Card title="Filters" icon="filter_list">
  <i>{willChangeOnNextChunkMessage}</i>
  <Checkbox name="Show only member chat messages" store={showOnlyMemberChat} />
</Card>

<Card title="Additional Options" icon="tune">
  <a
    href="https://myaccount.google.com/blocklist"
    class="ml-2 dark:text-primary-50 text-primary-900"
    target="_blank"
  >
    <span class="underline">Unblock chat users</span>
    <Icon class="inline align-middle" small>open_in_new</Icon>
  </a>
  <Checkbox name="Automatically switch to Live Chat" store={autoLiveChat} />
  <Checkbox name="Enable video comment flow overlay (experimental)" store={enableVideoFlowOverlay} />
  {#if $enableVideoFlowOverlay}
    <div class="mt-2 flex flex-col gap-2 text-sm">
      <label class="flex items-center gap-2">
        <span class="w-56">Max visible comments:</span>
        <input
          class="px-2 py-1 rounded border border-dark-200 dark:border-dark-500 bg-white dark:bg-dark-700 w-24"
          type="number"
          min="1"
          max="80"
          step="1"
          bind:value={$flowOverlayMaxVisible}
        />
      </label>
      <label class="flex items-center gap-2">
        <span class="w-56">Max render per second:</span>
        <input
          class="px-2 py-1 rounded border border-dark-200 dark:border-dark-500 bg-white dark:bg-dark-700 w-24"
          type="number"
          min="1"
          max="60"
          step="1"
          bind:value={$flowOverlayMaxPerSecond}
        />
      </label>
      <label class="flex items-center gap-2">
        <span class="w-56">Max delay (ms):</span>
        <input
          class="px-2 py-1 rounded border border-dark-200 dark:border-dark-500 bg-white dark:bg-dark-700 w-24"
          type="number"
          min="1000"
          max="60000"
          step="500"
          bind:value={$flowOverlayMaxDelayMs}
        />
      </label>
      <label class="flex items-center gap-2">
        <span class="w-56">Flow area top (%):</span>
        <input
          class="px-2 py-1 rounded border border-dark-200 dark:border-dark-500 bg-white dark:bg-dark-700 w-24"
          type="number"
          min="0"
          max="90"
          step="1"
          bind:value={$flowOverlayAreaTopPercent}
        />
      </label>
      <label class="flex items-center gap-2">
        <span class="w-56">Flow area height (%):</span>
        <input
          class="px-2 py-1 rounded border border-dark-200 dark:border-dark-500 bg-white dark:bg-dark-700 w-24"
          type="number"
          min="10"
          max="100"
          step="1"
          bind:value={$flowOverlayAreaHeightPercent}
        />
      </label>
    </div>
  {/if}
  <MessageTranslationSettings />
</Card>
