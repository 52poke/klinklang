import { projectWorkflowGraph, type StateMachineDefinition } from '@mudkipme/klinklang-domain'
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useNodesInitialized,
  useNodesState,
  useReactFlow
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { LayoutGrid, Map } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { type WorkflowCanvasNode, WorkflowNode } from './WorkflowNode'

interface WorkflowCanvasProps {
  definition: StateMachineDefinition
  selectedStateName: string | null
  onSelectState: (stateName: string | null) => void
  onConnect: (source: string, target: string, sourceHandle: string) => void
  readOnly?: boolean
}

const elk = new ELK()
const nodeTypes = { workflow: WorkflowNode }

// Wait for React Flow to measure the asynchronously laid out nodes before fitting.
const FitLayout: React.FC<{ version: number }> = ({ version }) => {
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!initialized) return
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, maxZoom: 1 })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [fitView, initialized, version])
  return null
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  definition,
  selectedStateName,
  onSelectState,
  onConnect,
  readOnly = false
}) => {
  const graph = useMemo(() => projectWorkflowGraph(definition), [definition])
  const [positions, setPositions, onNodesChange] = useNodesState<WorkflowCanvasNode>([])
  const [arrangeVersion, setArrangeVersion] = useState(0)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)
  const topology = JSON.stringify({
    children: graph.nodes.map(node => ({
      id: node.id,
      width: 240,
      height: node.state.Type === 'Choice' ? 100 + node.state.Choices.length * 24 : 88
    })),
    // Invalid draft targets must not cause ELK to reject the entire graph.
    edges: graph.edges.filter(edge => Object.hasOwn(definition.States, edge.target)).map(edge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  })

  useEffect(() => {
    let cancelled = false
    const shape = JSON.parse(topology) as {
      children: Array<{ id: string; width: number; height: number }>
      edges: Array<{ id: string; sources: string[]; targets: string[] }>
    }
    const applyPositions = (children: Array<{ id: string; x?: number; y?: number }>): void => {
      if (cancelled) return
      setPositions(children.map((node, index) => ({
        id: node.id,
        type: 'workflow',
        position: { x: node.x ?? (index % 2) * 330, y: node.y ?? Math.floor(index / 2) * 200 },
        data: { name: node.id, state: { Type: 'Succeed' }, isStart: false }
      })))
      setLayoutVersion(version => version + 1)
    }
    void elk.layout({
      id: 'workflow',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '60',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
      },
      ...shape
    }).then(layout => {
      if (cancelled) return
      setLayoutError(null)
      applyPositions(layout.children ?? [])
    }).catch(() => {
      if (cancelled) return
      setLayoutError('Automatic layout is unavailable. You can still move and connect states.')
      applyPositions(shape.children)
    })
    return () => {
      cancelled = true
    }
  }, [topology, arrangeVersion, setPositions])

  const nodes: WorkflowCanvasNode[] = positions.filter(node => Object.hasOwn(definition.States, node.id)).map(node => ({
    ...node,
    selected: node.id === selectedStateName,
    ariaLabel: `${node.id}, ${definition.States[node.id].Type}${node.id === definition.StartAt ? ', start state' : ''}`,
    data: { name: node.id, state: definition.States[node.id], isStart: node.id === definition.StartAt }
  }))
  const edges: Edge[] = graph.edges.filter(edge => Object.hasOwn(definition.States, edge.target)).map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    type: 'smoothstep',
    label: edge.kind === 'choice'
      ? `Rule ${(edge.choiceIndex ?? 0) + 1}`
      : edge.kind === 'default'
      ? 'Otherwise'
      : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    style: { stroke: edge.source === selectedStateName ? '#2563eb' : '#94a3b8', strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fill: '#475569' },
    labelBgStyle: { fill: '#f8fafc' }
  }))
  const handleConnect = (connection: Connection): void => {
    if (!readOnly) onConnect(connection.source, connection.target, connection.sourceHandle ?? 'next')
  }

  return (
    <div className='workflow-canvas h-full min-h-0 bg-slate-50/80'>
      <ReactFlow<WorkflowCanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => {
          onSelectState(node.id)
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement) {
            const name = event.target.closest<HTMLElement>('.react-flow__node')?.dataset.id
            if (name !== undefined) onSelectState(name)
          }
        }}
        onPaneClick={() => {
          onSelectState(null)
        }}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        edgesReconnectable={false}
        deleteKeyCode={null}
        minZoom={0.15}
        maxZoom={1.8}
      >
        <FitLayout version={layoutVersion} />
        <Background gap={20} size={1} color='#cbd5e1' />
        <Panel position='top-left' className='flex flex-wrap gap-1 rounded-lg border bg-card/95 p-1 shadow-sm'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              setArrangeVersion(version => version + 1)
            }}
          >
            <LayoutGrid className='size-4' />Arrange
          </Button>
          <Button
            size='sm'
            variant={showMap ? 'secondary' : 'ghost'}
            aria-label='Toggle minimap'
            aria-pressed={showMap}
            onClick={() => {
              setShowMap(value => !value)
            }}
          >
            <Map className='size-4' />
          </Button>
        </Panel>
        {layoutError !== null && (
          <Panel position='top-right'>
            <p role='status' className='max-w-56 rounded border bg-card p-2 text-xs'>{layoutError}</p>
          </Panel>
        )}
        <Panel
          position='bottom-center'
          className='pointer-events-none hidden rounded-full border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground xl:block'
        >
          {readOnly ? 'Select a state to inspect it' : 'Drag to move · Connect the dots to link states'}
        </Panel>
        {showMap && <MiniMap pannable zoomable className='!h-24 !w-36' />}
        <Controls aria-label='' showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
