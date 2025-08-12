<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';

  interface RawGroup {
    name: string;
    iconPath: string;
    executables: string[];
  }

  interface AppGroup extends RawGroup {
    iconData: string;
  }

  let groups: AppGroup[] = [];
  let naming = false;
  let newName = '';
  let pendingPaths: string[] = [];
  let pendingIconPath = '';

  // load existing groups + preload icons
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
    const rawOut: RawGroup[] = groups.map(({ name, iconPath, executables }) => ({
      name, iconPath, executables
    }));
    await invoke('save_app_config', { cfg: JSON.stringify(rawOut) });
  }

  async function addGroup() {
    // reset
    pendingPaths = [];
    pendingIconPath = '';

    while (true) {
      // pick exactly one file (either exe or image)
      const sel = await open({
        multiple: false,
        directory: false,
        title: 'Select an executable (or pick an image to finish)…'
      });
      if (!sel) return;
      const file = Array.isArray(sel) ? sel[0] : sel;
      const ext = file.split('.').pop()?.toLowerCase() || '';

      // if it's an image, treat that as the icon and break
      if (['png', 'jpg', 'jpeg', 'ico'].includes(ext)) {
        pendingIconPath = file;
        break;
      }

      // otherwise it's an executable: add it
      pendingPaths.push(file);

      // ask if they want to add another exe
      const more = confirm('Add another executable? “Cancel” will let you pick the icon.');
      if (!more) {
        // now choose icon explicitly
        const iconSel = await open({
          multiple: false,
          directory: false,
          title: 'Select an icon…',
          filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','ico'] }]
        });
        if (!iconSel) return;
        pendingIconPath = Array.isArray(iconSel) ? iconSel[0] : iconSel;
        break;
      }
    }

    // now prompt for a name
    newName = '';
    naming = true;
  }

  async function confirmName() {
    const name = newName.trim();
    if (!name) return;
    const iconData: string = await invoke('load_icon', { path: pendingIconPath });
    groups = [
      ...groups,
      {
        name,
        iconPath: pendingIconPath,
        executables: pendingPaths,
        iconData
      }
    ];
    await saveConfig();
    naming = false;
  }

  function cancelName() {
    naming = false;
  }

  async function launchGroup(i: number) {
    await invoke('launch_apps', { paths: groups[i].executables });
  }
</script>

<div class="app-grid">
  {#each groups as g, i}
    <div class="app-bubble" on:click={() => launchGroup(i)}>
      <img src={g.iconData} class="bubble-icon" alt={g.name} />
      <div class="bubble-label">{g.name}</div>
    </div>
  {/each}
  <div class="app-bubble plus" on:click={addGroup}>＋</div>
</div>

{#if naming}
  <div class="modal-backdrop">
    <div class="modal">
      <h3>Name this group</h3>
      <input
        bind:value={newName}
        placeholder="My Workflow…"
      />
      <div class="buttons">
        <button on:click={confirmName} disabled={!newName}>OK</button>
        <button on:click={cancelName}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
 .app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 160px);
  gap: 16px;
}

.app-bubble {
  position: relative;
  width: 160px; height: 120px;
  background-image: url('/Nonobubble.png');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.bubble-icon { width: 48px; height: 48px; object-fit: contain; }
.bubble-label {
  position: absolute; bottom: 10px;
  font-size: .8rem; color: #fff; text-shadow: 0 1px 2px #000;
}
.app-bubble.plus { font-size: 2rem; color: #eee; }


  /* modal styles */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: #fff; padding: 1rem; border-radius: 8px;
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .buttons { display: flex; gap: 0.5rem; justify-content: flex-end; }
  input { flex: 1; padding: 0.25rem; }
</style>
