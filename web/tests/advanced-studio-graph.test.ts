import { describe, expect, it } from 'vitest';
import {
  documentToFlow,
  flowToDocument,
  emptyDocument,
  nextLabelIndex,
  ADV_SCHEMA_VERSION,
  type AdvFlowEdge,
  type AdvFlowNode,
} from '@/lib/advanced-studio/document';
import {
  ADV_NODE_REGISTRY,
  ADV_NODE_TYPES,
  isAdvNodeType,
  nodeDefinition,
  nodeListings,
} from '@/lib/advanced-studio/registry';
import { coerceVideoSettings } from '@/lib/advanced-studio/registry/video-generator-node';
import { connectionProblem, isValidAdvConnection, type GraphNodeLike } from '@/lib/advanced-studio/validation';
import { resolveInputs } from '@/lib/advanced-studio/resolve-inputs';
import { acceptsDataType, ADV_DATA_TYPES } from '@/lib/advanced-studio/data-types';
import type { AdvDocument, AdvEngineCapability } from '@/lib/advanced-studio/types';

function capability(overrides: Partial<AdvEngineCapability> = {}): AdvEngineCapability {
  return {
    key: 'gemini',
    label: 'Google Gemini',
    ready: true,
    reason: null,
    models: [{ id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' }],
    defaultModel: 'gemini-3-pro-image-preview',
    image: {
      supported: true,
      textToImage: true,
      maxImages: 5,
      aspectRatios: ['1:1', '16:9'],
      defaultAspectRatio: '1:1',
      resolutions: [{ id: '1K', label: '1K', quality: 'medium' }],
      defaultResolution: '1K',
      maxOutputs: 4,
    },
    video: { supported: false },
    ...overrides,
  };
}

const capabilities = new Map([['gemini', capability()]]);

function graph(): GraphNodeLike[] {
  return [
    { id: 'text-1', type: 'text', data: { text: 'a lighthouse', mode: 'plain' } },
    { id: 'text-2', type: 'text', data: { text: 'second prompt', mode: 'plain' } },
    { id: 'image-1', type: 'imageInput', data: { imageUrl: '/storage/advanced/a.png' } },
    { id: 'gen-1', type: 'imageGenerator', data: { engine: 'gemini', outputs: 1, activeResultIndex: 0 } },
  ];
}

describe('node registry', () => {
  it('registers a definition for every node type', () => {
    for (const type of ADV_NODE_TYPES) {
      expect(ADV_NODE_REGISTRY[type].type).toBe(type);
      expect(nodeDefinition(type).label.length).toBeGreaterThan(0);
    }
  });

  it('only offers addable node types in the picker listing', () => {
    const addable = nodeListings().filter((listing) => listing.addable).map((listing) => listing.type);
    expect(addable).toContain('text');
    expect(addable).toContain('imageInput');
    expect(addable).toContain('imageGenerator');
    expect(addable).toContain('group');
    expect(addable).toContain('videoGenerator');
  });

  it('derives video handles from the selected model', () => {
    const videoCapability: AdvEngineCapability = {
      ...capability(),
      key: 'fal-video',
      label: 'fal.ai Video',
      image: { ...capability().image, supported: false },
      models: [{ id: 'image-video', label: 'Image Video' }],
      video: {
        supported: true,
        maxOutputs: 1,
        models: [{
          id: 'image-video', inputs: ['prompt', 'startFrame', 'endFrame'],
          durations: [5, 10], defaultDuration: 5,
          aspectRatios: ['16:9'], defaultAspectRatio: '16:9',
          resolutions: ['720p'], defaultResolution: '720p', sound: false,
        }],
      },
    };
    const definition = nodeDefinition('videoGenerator');
    const data = { ...definition.defaultData(), model: 'image-video' };
    expect(definition.handles(data, videoCapability).inputs.map((handle) => handle.id))
      .toEqual(['prompt', 'startFrame', 'endFrame']);
  });

  it('coerces unsupported settings when a video model changes', () => {
    const coerced = coerceVideoSettings(
      { outputs: 1, activeResultIndex: 0, duration: 10, aspectRatio: '1:1', resolution: '1080p', sound: true },
      {
        id: 'next', inputs: ['prompt'], durations: [5], defaultDuration: 5,
        aspectRatios: ['16:9'], defaultAspectRatio: '16:9',
        resolutions: ['720p'], defaultResolution: '720p', sound: false,
      },
    );
    expect(coerced).toEqual({ duration: 5, aspectRatio: '16:9', resolution: '720p', sound: false });
  });

  it('rejects unknown node types', () => {
    expect(isAdvNodeType('text')).toBe(true);
    expect(isAdvNodeType('definitelyNotANode')).toBe(false);
  });

  it('exposes the image generator handles a model actually supports', () => {
    const definition = nodeDefinition('imageGenerator');
    const withImages = definition.handles(definition.defaultData(), capability());
    expect(withImages.inputs.map((handle) => handle.id)).toEqual(['prompt', 'image']);
    expect(withImages.inputs[1].maxConnections).toBe(5);
    expect(withImages.outputs[0].dataType).toBe('image');

    const textOnly = definition.handles(
      definition.defaultData(),
      capability({ image: { ...capability().image, maxImages: 0 } }),
    );
    expect(textOnly.inputs.map((handle) => handle.id)).toEqual(['prompt']);
  });
});

describe('typed connections', () => {
  it('accepts a text output on a prompt input', () => {
    expect(isValidAdvConnection(
      { source: 'text-1', sourceHandle: 'text', target: 'gen-1', targetHandle: 'prompt' },
      graph(), [], capabilities,
    )).toBe(true);
  });

  it('accepts an image output on an image input', () => {
    expect(isValidAdvConnection(
      { source: 'image-1', sourceHandle: 'image', target: 'gen-1', targetHandle: 'image' },
      graph(), [], capabilities,
    )).toBe(true);
  });

  it('rejects an image output on a text input with an explanation', () => {
    const problem = connectionProblem(
      { source: 'image-1', sourceHandle: 'image', target: 'gen-1', targetHandle: 'prompt' },
      graph(), [], capabilities,
    );
    expect(problem).toMatch(/accepts text/i);
  });

  it('rejects a node connecting to itself', () => {
    expect(connectionProblem(
      { source: 'gen-1', sourceHandle: 'image', target: 'gen-1', targetHandle: 'image' },
      graph(), [], capabilities,
    )).toMatch(/itself/i);
  });

  it('enforces the single-connection limit on the prompt input', () => {
    const existing = [{ id: 'e1', source: 'text-1', target: 'gen-1', targetHandle: 'prompt' }];
    expect(connectionProblem(
      { source: 'text-2', sourceHandle: 'text', target: 'gen-1', targetHandle: 'prompt' },
      graph(), existing, capabilities,
    )).toMatch(/one connection/i);
  });

  it('enforces the model-specific reference image limit', () => {
    const limited = new Map([['gemini', capability({ image: { ...capability().image, maxImages: 1 } })]]);
    const existing = [{ id: 'e1', source: 'image-1', target: 'gen-1', targetHandle: 'image' }];
    const nodes = [...graph(), { id: 'image-2', type: 'imageInput' as const, data: { imageUrl: '/storage/b.png' } }];
    expect(connectionProblem(
      { source: 'image-2', sourceHandle: 'image', target: 'gen-1', targetHandle: 'image' },
      nodes, existing, limited,
    )).toMatch(/at most 1|one connection/i);
  });

  it('rejects a duplicate connection from the same source', () => {
    const existing = [{ id: 'e1', source: 'image-1', target: 'gen-1', targetHandle: 'image' }];
    expect(connectionProblem(
      { source: 'image-1', sourceHandle: 'image', target: 'gen-1', targetHandle: 'image' },
      graph(), existing, capabilities,
    )).toMatch(/already connected/i);
  });

  it('uses one icon and colour per data type across every node', () => {
    expect(ADV_DATA_TYPES.text.glyph).toBe('T');
    expect(ADV_DATA_TYPES.image.glyph).toBe('image');
    expect(acceptsDataType('image', 'text')).toBe(false);
    expect(acceptsDataType('image', 'image')).toBe(true);
  });
});

describe('input resolution', () => {
  it('buckets connected outputs by the input they land on', () => {
    const resolved = resolveInputs('gen-1', graph(), [
      { id: 'e1', source: 'text-1', target: 'gen-1', targetHandle: 'prompt' },
      { id: 'e2', source: 'image-1', target: 'gen-1', targetHandle: 'image' },
    ]);
    expect(resolved.prompt).toBe('a lighthouse');
    expect(resolved.imageUrls).toEqual(['/storage/advanced/a.png']);
  });

  it('treats a generated image as an image source for a downstream node', () => {
    const nodes: GraphNodeLike[] = [
      { id: 'prev', type: 'imageGenerator', data: { results: [{ imageUrl: '/storage/generations/x/output.png' }], activeResultIndex: 0, outputs: 1 } },
      { id: 'gen-1', type: 'imageGenerator', data: { outputs: 1, activeResultIndex: 0 } },
    ];
    const resolved = resolveInputs('gen-1', nodes, [
      { id: 'e1', source: 'prev', target: 'gen-1', targetHandle: 'image' },
    ]);
    expect(resolved.imageUrls).toEqual(['/storage/generations/x/output.png']);
  });

  it('ignores empty prompts', () => {
    const nodes: GraphNodeLike[] = [
      { id: 'text-1', type: 'text', data: { text: '   ', mode: 'plain' } },
      { id: 'gen-1', type: 'imageGenerator', data: { outputs: 1, activeResultIndex: 0 } },
    ];
    const resolved = resolveInputs('gen-1', nodes, [
      { id: 'e1', source: 'text-1', target: 'gen-1', targetHandle: 'prompt' },
    ]);
    expect(resolved.prompt).toBe('');
  });
});

describe('document serialization', () => {
  const document: AdvDocument = {
    schemaVersion: ADV_SCHEMA_VERSION,
    template: 'image',
    viewport: { x: -40, y: 12, zoom: 0.8 },
    locked: false,
    nodes: [
      { id: 'text-1', type: 'text', position: { x: 0, y: 0 }, width: 460, height: 300, label: 'Prompt #1', data: { text: 'hello', mode: 'plain' } },
      { id: 'gen-1', type: 'imageGenerator', position: { x: 520, y: 0 }, width: 420, height: 620, label: 'Image Generator #1', data: { outputs: 1, activeResultIndex: 0 } },
    ],
    edges: [
      { id: 'e1', source: 'text-1', sourceHandle: 'text', target: 'gen-1', targetHandle: 'prompt', dataType: 'text' },
    ],
  };

  it('round-trips a document through React Flow and back', () => {
    const { nodes, edges } = documentToFlow(document);
    const restored = flowToDocument(nodes, edges, document.viewport, document.template, document.locked);
    expect(restored).toEqual(document);
  });

  it('keeps node geometry, labels and the viewport', () => {
    const { nodes } = documentToFlow(document);
    expect(nodes[0].width).toBe(460);
    expect(nodes[0].data.label).toBe('Prompt #1');
    const restored = flowToDocument(nodes, [], { x: 1.4, y: 2.6, zoom: 1.23456 }, 'image');
    expect(restored.viewport).toEqual({ x: 1, y: 3, zoom: 1.235 });
  });

  it('round-trips collapsed state and remembered expanded geometry', () => {
    const collapsed: AdvDocument = {
      ...document,
      nodes: [{
        ...document.nodes[0],
        width: 320,
        height: 68,
        collapsed: true,
        expandedWidth: 620,
        expandedHeight: 410,
      }],
      edges: [],
    };
    const { nodes } = documentToFlow(collapsed);
    expect(nodes[0].data).toMatchObject({ collapsed: true, expandedWidth: 620, expandedHeight: 410 });
    expect(flowToDocument(nodes, [], null, 'image').nodes[0]).toMatchObject({
      collapsed: true,
      expandedWidth: 620,
      expandedHeight: 410,
    });
  });

  it('drops nodes of unknown types and edges to missing nodes', () => {
    const { nodes, edges } = documentToFlow({
      ...document,
      nodes: [...document.nodes, { id: 'weird', type: 'quantumNode' as never, position: { x: 0, y: 0 }, data: {} as never }],
      edges: [...document.edges, { id: 'e2', source: 'text-1', target: 'ghost' }],
    });
    expect(nodes.map((node) => node.id)).toEqual(['text-1', 'gen-1']);
    expect(edges.map((edge) => edge.id)).toEqual(['e1']);
  });

  it('tags each edge with its data type for styling', () => {
    const { edges } = documentToFlow(document);
    expect(edges[0].className).toContain('adv-edge-text');
    expect(edges[0].data?.dataType).toBe('text');
  });

  it('starts a blank document at the current schema version', () => {
    expect(emptyDocument().schemaVersion).toBe(ADV_SCHEMA_VERSION);
    expect(emptyDocument('storyboard').template).toBe('storyboard');
  });

  it('numbers new node labels without reusing an existing one', () => {
    const nodes = documentToFlow(document).nodes as AdvFlowNode[];
    expect(nextLabelIndex(nodes, 'text')).toBe(2);
    expect(nextLabelIndex(nodes, 'imageInput')).toBe(1);
  });

  it('keeps group frames behind their members', () => {
    const { nodes } = documentToFlow({
      ...document,
      nodes: [{ id: 'g', type: 'group', position: { x: 0, y: 0 }, label: 'Scene 1', data: { memberIds: ['text-1'] } }, ...document.nodes],
    });
    expect(nodes[0].zIndex).toBe(-1);
    expect(nodes[1].zIndex).toBe(0);
  });

  it('serializes edges without dropping handles', () => {
    const edges: AdvFlowEdge[] = [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'image', targetHandle: 'image', data: { dataType: 'image' } },
    ];
    const restored = flowToDocument([], edges, null, 'blank');
    expect(restored.edges[0]).toEqual({
      id: 'e1', source: 'a', target: 'b', sourceHandle: 'image', targetHandle: 'image', dataType: 'image',
    });
  });
});
