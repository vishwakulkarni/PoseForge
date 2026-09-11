import type { StudioNodeActions, StudioNodeData } from '../canvas';

/**
 * Props shared by every per-kind node body component. `canvas.tsx`'s
 * `StudioNode` owns the shared shell (resizer, connection handles, the
 * floating tab, and the selected-node block menu) and computes the
 * kind-independent derived state below once, then dispatches to the body
 * matching `data.kind`.
 */
export interface StudioNodeBodyProps {
  id: string;
  data: StudioNodeData;
  actions: StudioNodeActions;
  /** True while this node's generation/assist run is in flight (image nodes). */
  running: boolean;
  /** True when this node's last generation/assist run failed. */
  failed: boolean;
  /** True while this specific node's own Run/Improve action is in flight. */
  isRunningNode: boolean;
  /** The node kind's icon, already resolved from `TYPE_COPY`. */
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}
