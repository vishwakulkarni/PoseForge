'use client';

import * as React from 'react';
import { NodeResizer, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Scan,
  Trash2,
  Unplug,
} from 'lucide-react';
import { nodeDefinition } from '@/lib/advanced-studio/registry';
import type { AdvNodeType } from '@/lib/advanced-studio/types';
import type { AdvFlowNode } from '@/lib/advanced-studio/document';
import { AdvHandle } from './handles';
import { ADV_NODE_BODIES } from './nodes';
import { useAdvNodeActions } from './node-context';
import { cn } from '@/lib/utils';

/**
 * Shared node chrome: frame, title bar, resizer, typed handles and the node
 * menu. Bodies render only their own content, which keeps handle layout and
 * keyboard behaviour identical across every node type — including ones added
 * later.
 */
function AdvNodeShellComponent({ id, type, data, selected }: NodeProps<AdvFlowNode>) {
  const actions = useAdvNodeActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draftLabel, setDraftLabel] = React.useState(data.label);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const nodeType = (type ?? 'text') as AdvNodeType;
  const definition = nodeDefinition(nodeType);
  const Icon = definition.icon;
  const Body = ADV_NODE_BODIES[nodeType];
  const capability = actions.capabilityFor((data as { engine?: string }).engine);
  // Registry definitions are narrowed per node type; this call site is
  // intentionally generic over all of them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handles = definition.handles(data as any, capability);
  const status = (data as { status?: string }).status;
  const running = actions.runningNodeIds.has(id) || status === 'running' || status === 'queued';
  const collapsed = data.collapsed === true;
  const connectionCount = actions.connectionCountFor(id);

  // Handle positions change when a model adds or removes an input; React Flow
  // needs to remeasure or existing edges would point at stale coordinates.
  const handleSignature = handles.inputs.map((handle) => handle.id).join('|');
  React.useEffect(() => {
    updateNodeInternals(id);
  }, [handleSignature, id, updateNodeInternals]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <article
      className={cn(
        'adv-node',
        `adv-node-${nodeType}`,
        selected && 'is-selected',
        running && 'is-running',
        status === 'error' && 'is-failed',
        collapsed && 'is-collapsed',
      )}
      aria-label={`${definition.label}: ${data.label}`}
    >
      <NodeResizer
        isVisible={Boolean(selected && !actions.locked && !collapsed)}
        minWidth={definition.geometry.minWidth}
        minHeight={definition.geometry.minHeight}
        maxWidth={definition.geometry.maxWidth}
        maxHeight={definition.geometry.maxHeight}
        lineClassName="adv-resize-line"
        handleClassName="adv-resize-handle"
        onResizeStart={actions.beginResize}
      />

      {handles.inputs.map((handle, index) => (
        <AdvHandle
          key={handle.id}
          handle={handle}
          direction="input"
          index={index}
          total={handles.inputs.length}
        />
      ))}
      {handles.outputs.map((handle, index) => (
        <AdvHandle
          key={handle.id}
          handle={handle}
          direction="output"
          index={index}
          total={handles.outputs.length}
        />
      ))}

      <header
        className="adv-node-head"
        onDoubleClick={(event) => {
          if (actions.locked || nodeType === 'group' || (event.target as HTMLElement).closest('button, input')) return;
          event.stopPropagation();
          actions.toggleNodeCollapse(id);
        }}
      >
        <span className="adv-node-title">
          <Icon aria-hidden size={13} strokeWidth={1.9} />
          {renaming ? (
            <form
              className="nodrag nopan"
              onSubmit={(event) => {
                event.preventDefault();
                actions.renameNode(id, draftLabel.trim() || data.label);
                setRenaming(false);
              }}
            >
              <input
                className="adv-rename-input"
                value={draftLabel}
                maxLength={120}
                autoFocus
                aria-label="Node name"
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={() => {
                  actions.renameNode(id, draftLabel.trim() || data.label);
                  setRenaming(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDraftLabel(data.label);
                    setRenaming(false);
                  }
                }}
              />
            </form>
          ) : (
            <span className="adv-node-name">{data.label}</span>
          )}
        </span>

        <div className="adv-node-menu nodrag nopan" ref={menuRef}>
          <button
            type="button"
            className="adv-icon-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`${data.label} actions`}
            title="Node actions"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <MoreHorizontal aria-hidden size={15} />
          </button>
          {menuOpen ? (
            <div className="adv-node-menu-popover" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={actions.locked}
                onClick={() => {
                  setDraftLabel(data.label);
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                <Pencil aria-hidden size={13} /> Rename
              </button>
              {nodeType === 'imageInput' && (data as { imageUrl?: string }).imageUrl ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={actions.locked}
                  onClick={() => {
                    actions.toggleImageFit(id);
                    setMenuOpen(false);
                  }}
                >
                  <Scan aria-hidden size={13} /> Image: {(data as { imageFit?: string }).imageFit === 'fit' ? 'Fit' : 'Fill'}
                </button>
              ) : null}
              {!collapsed ? (
                <>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => { actions.resizeNode(id, 'smaller'); setMenuOpen(false); }}>
                    <Minimize2 aria-hidden size={13} /> Smaller
                  </button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => { actions.resizeNode(id, 'larger'); setMenuOpen(false); }}>
                    <Maximize2 aria-hidden size={13} /> Larger
                  </button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => { actions.resizeNode(id, 'default'); setMenuOpen(false); }}>
                    <RotateCcw aria-hidden size={13} /> Reset size
                  </button>
                </>
              ) : null}
              {nodeType !== 'group' ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={actions.locked}
                  onClick={() => {
                    actions.toggleNodeCollapse(id);
                    setMenuOpen(false);
                  }}
                >
                  {collapsed ? <ChevronDown aria-hidden size={13} /> : <ChevronUp aria-hidden size={13} />}
                  {collapsed ? 'Expand' : 'Collapse'}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={actions.locked}
                onClick={() => {
                  actions.duplicateNode(id);
                  setMenuOpen(false);
                }}
              >
                <Copy aria-hidden size={13} /> Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={actions.locked || connectionCount === 0}
                onClick={() => {
                  actions.disconnectNode(id);
                  setMenuOpen(false);
                }}
              >
                <Unplug aria-hidden size={13} /> Disconnect{connectionCount ? ` (${connectionCount})` : ''}
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-destructive"
                disabled={actions.locked}
                onClick={() => {
                  actions.removeNode(id);
                  setMenuOpen(false);
                }}
              >
                <Trash2 aria-hidden size={13} /> Delete
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {collapsed ? (
        <div className="adv-collapsed-body">
          <span>{running ? 'Running' : status === 'error' ? 'Needs attention' : definition.label}</span>
          <small>Double-click the header to expand</small>
        </div>
      ) : (
        <Body id={id} type={nodeType} data={data} selected={Boolean(selected)} actions={actions} />
      )}
    </article>
  );
}

/** Memoized so editing one node does not re-render the rest of the graph. */
export const AdvNodeShell = React.memo(AdvNodeShellComponent);
