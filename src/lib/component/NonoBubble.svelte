<script lang="ts">
  import { bubble, hideNonoBubble } from '$lib/nonoBubble';
  import { get } from 'svelte/store';
  let state = get(bubble);
  const unsub = bubble.subscribe(v => state = v);
  import { onDestroy } from 'svelte';
  onDestroy(unsub);

  function snooze(min: number) {
    state.onSnooze?.(min);
    hideNonoBubble();
  }
</script>

{#if state.visible}
  <div class="nono-toast" on:click|stopPropagation>
    <img class="bubble-bg" src="/nonotalkingbubble.png" alt="Nono bubble" />
    <div class="content">
      <div class="msg">{state.message}</div>
      <div class="actions">
        <button on:click={() => snooze(5)}>Snooze 5</button>
        <button on:click={() => snooze(10)}>10</button>
        <button on:click={() => snooze(30)}>30</button>
        <button class="ghost" on:click={hideNonoBubble}>Dismiss</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .nono-toast {
    position: fixed;
    bottom: 24px; right: 24px;
    width: 380px; max-width: calc(100vw - 32px);
    z-index: 10020;
    display: grid; grid-template-columns: 1fr;
    pointer-events: auto;
    animation: pop .15s ease-out;
  }
  @keyframes pop { from { transform: translateY(8px); opacity: .0; } to { transform: translateY(0); opacity: 1; } }

  .bubble-bg {
    width: 100%;
    height: auto;
    display: block;
    filter: drop-shadow(0 12px 30px rgba(0,0,0,.35));
  }
  .content {
    position: absolute;
    inset: 0;
    padding: 20px 18px 14px 24px; /* tweak to sit nicely on your PNG */
    display: flex; flex-direction: column; gap: 10px;
  }
  .msg {
    color: #fff;
    text-shadow: 0 2px 6px rgba(0,0,0,.5);
    font-size: 16px; line-height: 1.3; font-weight: 700;
  }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    padding: 6px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.35);
    background: rgba(255,255,255,.15); color: #fff; cursor: pointer;
    backdrop-filter: blur(6px);
  }
  button.ghost { background: transparent; }
  button:hover { background: rgba(255,255,255,.25); }
</style>
