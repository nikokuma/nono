import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import { getLogicalBounds } from './window';   // <— your helper
import { calculateResizeDimensions } from './resizeLogic';
import { setNonoScale }            from './nonoState';
import { BASE_HEIGHT }             from './constants';

const appWindow = getCurrentWindow();

let initialY = 0;
let initialHeight = 0;
let initialWinW = 0;        // now in logical px
let initialWinH = 0;        // now in logical px
let initialWinX = 0;        // logical
let initialWinY = 0;        // logical
let wrapperEl!: HTMLElement;

export async function startResizeDrag(e: MouseEvent, wrapper: HTMLElement) {
  e.preventDefault();
  e.stopPropagation();

  wrapperEl     = wrapper;
  initialY      = e.clientY;
  initialHeight = wrapper.getBoundingClientRect().height; // CSS px

   // ✅ grab the **logical** size & pos instead:
  const { pos, size } = await getLogicalBounds();
  initialWinX = pos.x;
  initialWinY = pos.y;
  initialWinW = size.width;
  initialWinH = size.height;


  window.addEventListener('mousemove', handleResizeDrag);
  window.addEventListener('mouseup',   endResizeDrag);
}

async function handleResizeDrag(e: MouseEvent) {
  e.preventDefault();

  // 1) Compute how much the user has dragged
  const delta     = e.clientY - initialY;
  const rawHeight = initialHeight + delta;
  const { width, height } = calculateResizeDimensions(rawHeight);

  console.log({ rawHeight, height, initialWinH, delta, offsetY: (height - initialWinH) / 2 });

  // 2) Resize the wrapper’s actual layout box
  wrapperEl.style.width  = `${width}px`;
  wrapperEl.style.height = `${height}px`;

  // 3) If you still need any internal scale (e.g. for menu pops), reset to 1
  setNonoScale(1);

  // 4) Compute how much to shift the window to keep it centered
  const offsetX = (width  - initialWinW) / 2;
  const offsetY = (height - initialWinH) / 2;

  // 5) Resize the Tauri window to match the new logical size
  await appWindow.setSize(new LogicalSize(width, height));
  const { size: newSize } = await getLogicalBounds();
  console.log('After setSize →', newSize.height);

  // 6) Reposition so the center stays roughly where it was
  await appWindow.setPosition(
    new LogicalPosition(
      initialWinX - offsetX,
      Math.max(initialWinY - offsetY, 0)
    )
  );
}


function endResizeDrag() {
  window.removeEventListener('mousemove', handleResizeDrag);
  window.removeEventListener('mouseup',   endResizeDrag);
}
