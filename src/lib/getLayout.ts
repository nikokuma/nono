import { getWindowPosition} from "./getWindowPosition";
import { getScreenSide, type Layout } from "./getScreenSide";

export async function getLayout(): Promise<Layout> {
  try {
    const pos = await getWindowPosition();
    return getScreenSide(pos);
  } catch (err) {
    console.error('Error getting layout position:', err);
    return 'middle';
  }
}
