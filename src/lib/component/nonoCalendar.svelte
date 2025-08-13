<script lang="ts">
  import { Calendar } from '@event-calendar/core';
  import dayGridPlugin from '@event-calendar/day-grid';

  import '@event-calendar/core/index.css';
  import '/Users/nico/Projects/Nono/nono-app/src/vendor/event-calendar/day-grid.css';

  const options = {
    plugins: [dayGridPlugin],
    view: 'dayGridMonth',
    // have it use the whole box
    height: '100%',
    dayMaxEventRows: 3,
    // short weekday names, uppercase
    dayHeaderFormat: { weekday: 'short' }, // "Sun", "Mon", ...
    locale: 'en-US',
    headerToolbar: { start: 'title', center: '', end: 'today prev,next' },
    events: [
      { title: 'Feed the birds', start: new Date() },
      { title: 'Water the peppers', start: new Date(Date.now() + 86400000) },
    ],
  };

  console.log('dayGridPlugin =', dayGridPlugin);

</script>


<div class="calendar-wrapper">
  <img src="CalendarBubble.png" class="calendar-frame" alt="frame" />
  <div class="calendar-overlay">
    <Calendar {options} />
  </div>
</div>

<style>
  /* keep what's above, add these overrides */
  .calendar-overlay :global(.ec) { color: #fff; }

  /* Day name row */
  .calendar-overlay :global(.ec-day-header) {
    background: transparent;
    border: none;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgba(0,0,0,.5);
  }

  /* Day cells */
  .calendar-overlay :global(.ec-day) {
    background: transparent;
    border: none;               /* no borders, PNG grid is the border */
  }

  /* Day number in top-right of each cell */
  .calendar-overlay :global(.ec-day-number) {
    color: #fff;
    font-weight: 700;
    padding: 6px 8px;
    text-shadow: 0 1px 2px rgba(0,0,0,.6);
  }

  /* Today highlight – subtle so it doesn't fight the PNG */
  .calendar-overlay :global(.ec-today) {
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.25);
    border-radius: 8px;
    background: rgba(255,255,255,.06);
  }

  /* Event chip style (optional) */
  .calendar-overlay :global(.ec-event) {
    background: rgba(255,255,255,.18);
    border: 1px solid rgba(255,255,255,.35);
    color: #fff;
    border-radius: 6px;
    padding: 2px 6px;
  }
</style>


