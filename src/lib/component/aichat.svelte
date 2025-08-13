<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { writable, get } from 'svelte/store';

  interface Message { role: 'user' | 'assistant'; content: string; id: number }
  const messages = writable<Message[]>([]);
  let input = '';
  let nextId = 1;

  async function send() {
  if (!input) return;

  const userMsg: Message = { role: 'user', content: input, id: nextId++ };
  messages.update(m => [...m, userMsg]);

  const context = get(messages).map(({ role, content }) => ({ role, content }));
  console.log('[Chat] Sending context →', context);

  try {
    const response: string = await invoke('chat', { messages: context });
    console.log('[Chat] Received response →', response);

    const botMsg: Message = { role: 'assistant', content: response, id: nextId++ };
    messages.update(m => [...m, botMsg]);
  } catch (e) {
    console.error('[Chat] invoke failed:', e);
    // Optionally show an error bubble:
    messages.update(m => [
      ...m,
      { role: 'assistant', content: '⚠️ Error talking to Nono.', id: nextId++ }
    ]);
  }

  input = '';
}

</script>

<style>
  .message-container { display:flex; flex-direction:column; gap:.5rem; overflow-y:auto; max-height: calc(100% - 3rem); padding: 1rem; }

.message { position: relative; display: inline-block; max-width: min(60ch, 70%); }
.role-user     { align-self: flex-end; }
.role-assistant{ align-self: flex-start; }

.bubble-bg {
  width: 100%;
  height: auto;
  aspect-ratio: 3 / 1;         /* or whatever your PNG roughly is */
  object-fit: contain;           /* keep aspect intact */
  display: block;
}

.bubble-text {
  position: absolute;
  inset: 8% 10% 12% 10%;         /* text box inside the PNG’s safe area */
  overflow-wrap: anywhere;
  line-height: 1.25;
}


  .input-container {
    display: flex;
    padding: 0.5rem;
    border-top: 1px solid #ccc;
  }
  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #aaa;
    border-radius: 4px;
    margin-right: 0.5rem;
  }
  button {
    padding: 0.5rem 1rem;
    border: none; border-radius: 4px;
    cursor: pointer;
  }
</style>

<div class="message-container">
  {#each $messages as msg (msg.id)}
    <div class="message {msg.role}">
      <!-- bubble background -->
      <img
        class="bubble-bg"
        src={msg.role === 'user'
              ? '/chatuserbubble.png'
              : '/chatnonobubble.png'}
        alt=""
      />
      <!-- bubble text -->
      <div class="bubble-text">{msg.content}</div>
    </div>
  {/each}
</div>

<div class="input-container">
  <input
    bind:value={input}
    on:keypress={(e) => e.key === 'Enter' && send()}
    placeholder="Type a message…"
  />
  <button on:click={send}>Send</button>
</div>
