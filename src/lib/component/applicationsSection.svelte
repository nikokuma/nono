<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';

  import type { Side } from '$lib/windowControl';
  export let dockSide: Side = 'right';
  export let layout: 'left' | 'right' | 'middle' | 'bottom-left' | 'bottom-right' = 'right';

  interface RawGroup { name: string; iconPath: string; executables: string[]; }
  interface AppGroup extends RawGroup { iconData: string; }

  let groups: AppGroup[] = [];
  let naming = false;
  let newName = '';
  let pendingPaths: string[] = [];
  let pendingIconPath = '';

  onMount(async () => {
    const json: string = await invoke('load_app_config');
    const raws: RawGroup[] = JSON.parse(json);
    groups = await Promise.all(
      raws.map(async (g) => {
        const iconData: string = await invoke('load_icon', { path: g.iconPath });
        return { ...g, iconData };
      })
    );
  });

  async function saveConfig() {
    const rawOut: RawGroup[] = groups.map(({ name, iconPath, executables }) => ({ name, iconPath, executables }));
    await invoke('save_app_config', { cfg: JSON.stringify(rawOut) });
  }

  async function addGroup() {
    pendingPaths = [];
    pendingIconPath = '';

    while (true) {
      const sel = await open({ multiple: false, directory: false, title: 'Select an executable (or pick an image to finish)…' });
      if (!sel) return;
      const file = Array.isArray(sel) ? sel[0] : sel;
      const ext = file.split('.').pop()?.toLowerCase() || '';
      if (['png','jpg','jpeg','ico','webp'].includes(ext)) { pendingIconPath = file; break; }
      pendingPaths.push(file);

      const more = confirm('Add another executable? “Cancel” will let you pick the icon.');
      if (!more) {
        const iconSel = await open({
          multiple: false, directory: false, title: 'Select an icon…',
          filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','ico','webp'] }]
        });
        if (!iconSel) return;
        pendingIconPath = Array.isArray(iconSel) ? iconSel[0] : iconSel;
        break;
      }
    }
    newName = ''; naming = true;
  }

  async function confirmName() {
    const name = newName.trim();
    if (!name) return;
    const iconData: string = await invoke('load_icon', { path: pendingIconPath });
    groups = [...groups, { name, iconPath: pendingIconPath, executables: pendingPaths, iconData }];
    await saveConfig();
    naming = false;
  }
  const cancelName = () => (naming = false);

  async function launchGroup(i: number) {
    await invoke('launch_apps', { paths: groups[i].executables });
  }

  // limit to five + plus bubble
  $: visible = groups.slice(0, 5);
</script>

<!-- Absolute container like your menu -->
<div class="apps-bubble-container layout-{layout}">
  {#each visible as g, i}
    <div class="bubble app" on:click={() => launchGroup(i)} title={g.name}>
      <img src={g.iconData} class="icon" alt={g.name} />
      <div class="label">{g.name}</div>
    </div>
  {/each}
  <div class="bubble plus" on:click={addGroup} title="Add">＋</div>
</div>

{#if naming}
  <div class="modal-backdrop">
    <div class="modal">
      <h3>Name this group</h3>
      <input bind:value={newName} placeholder="My Workflow…" />
      <div class="buttons">
        <button on:click={confirmName} disabled={!newName}>OK</button>
        <button on:click={cancelName}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .apps-bubble-container {
  position: absolute;
  inset: 0;
  pointer-events: none; /* children enable it */
}

/* Centered anchor; offsets via --dx/--dy */
.bubble {
  position: absolute;
  top: 50%; left: 50%;
  width: 120px; height: 100px;
  background-image: url('/Nonobubble.png');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  display: grid; place-items: center;
  cursor: pointer; pointer-events: auto; user-select: none;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.35));

  --dx: 0%; --dy: 0%;
  transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy)));
}
.bubble:active {
  transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) translateY(1px) scale(0.995);
}
  .icon { width: 44px; height: 44px; object-fit: contain; }
  .label {
    position: absolute; bottom: 8px; left: 8px; right: 8px;
    font-size: .75rem; color: #fff; text-shadow: 0 1px 2px #000;
    text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .bubble.plus { font-size: 1.8rem; color: #eef; }

  /* ====== POSITION MAPS (edit these like your menu!) ====== */
  /* Middle */
  .apps-bubble-container.layout-middle .bubble:nth-child(1) { transform: translate(-160%, -110%); }
  .apps-bubble-container.layout-middle .bubble:nth-child(2) { transform: translate(-140%, -150%); }
  .apps-bubble-container.layout-middle .bubble:nth-child(3) { transform: translate(20%, -150%); }
  .apps-bubble-container.layout-middle .bubble:nth-child(4) { transform: translate(50%, -110%); }
  .apps-bubble-container.layout-middle .bubble:nth-child(5) { transform: translate(-55%, -40%); }
  .apps-bubble-container.layout-middle .bubble.plus        { transform: translate(15%, -40%); }

  /* Left */
  .apps-bubble-container.layout-left .bubble:nth-child(1) { transform: translate(50%, 20%); }
  .apps-bubble-container.layout-left .bubble:nth-child(2) { transform: translate(50%, -30%); }
  .apps-bubble-container.layout-left .bubble:nth-child(3) { transform: translate(50%, -80%); }
  .apps-bubble-container.layout-left .bubble:nth-child(4) { transform: translate(50%, -120%); }
  .apps-bubble-container.layout-left .bubble:nth-child(5) { transform: translate(28%, -10%); }
  .apps-bubble-container.layout-left .bubble.plus         { transform: translate(12%, -60%); }

  /* Right */
  .apps-bubble-container.layout-right .bubble:nth-child(1) { transform: translate(20%, -200%); }
  .apps-bubble-container.layout-right .bubble:nth-child(2) { transform: translate(20%, -300%); }
  .apps-bubble-container.layout-right .bubble:nth-child(3) { transform: translate(120%, -300%); }
  .apps-bubble-container.layout-right .bubble:nth-child(4) { transform: translate(35%, 0%); }
  .apps-bubble-container.layout-right .bubble:nth-child(5) { transform: translate(40%, -140%); }
  .apps-bubble-container.layout-right .bubble.plus         { transform: translate(65%, -110%); }

  /* Bottom-left */
  .apps-bubble-container.layout-bottom-left .bubble:nth-child(1) { transform: translate(-30%, 30%); }
  .apps-bubble-container.layout-bottom-left .bubble:nth-child(2) { transform: translate(-45%, 3%); }
  .apps-bubble-container.layout-bottom-left .bubble:nth-child(3) { transform: translate(3%, -18%); }
  .apps-bubble-container.layout-bottom-left .bubble:nth-child(4) { transform: translate(24%, -12%); }
  .apps-bubble-container.layout-bottom-left .bubble:nth-child(5) { transform: translate(-8%, 10%); }
  .apps-bubble-container.layout-bottom-left .bubble.plus         { transform: translate(34%, 8%); }

  /* Bottom-right */
  .apps-bubble-container.layout-bottom-right .bubble:nth-child(1) { transform: translate(36%, 36%); }
  .apps-bubble-container.layout-bottom-right .bubble:nth-child(2) { transform: translate(12%, 30%); }
  .apps-bubble-container.layout-bottom-right .bubble:nth-child(3) { transform: translate(6%, 3%); }
  .apps-bubble-container.layout-bottom-right .bubble:nth-child(4) { transform: translate(-18%, 12%); }
  .apps-bubble-container.layout-bottom-right .bubble:nth-child(5) { transform: translate(10%, 20%); }
  .apps-bubble-container.layout-bottom-right .bubble.plus         { transform: translate(-30%, 24%); }

  /* modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
  .modal { background: #fff; padding: 1rem; border-radius: 10px; display: flex; flex-direction: column; gap: .5rem; min-width: 260px; }
  .buttons { display: flex; gap: .5rem; justify-content: flex-end; }
  input { flex: 1; padding: .4rem .5rem; border-radius: 8px; border: 1px solid #ccc; }
</style>
