import { projectWorkflowGraph, type StateMachineDefinition } from '@mudkipme/klinklang-domain'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import React, { useEffect, useMemo, useRef } from 'react'
import { WorkflowNode, type WorkflowCanvasNode } from './WorkflowNode'

interface WorkflowCanvasProps {
  definition: StateMachineDefinition
  selectedStateName: string | null
  onSelectState: (stateName: string | null) => void
  onConnect: (source: string, target: string, sourceHandle: string) => void
  readOnly?: boolean
}

const elk = new ELK()
const nodeTypes = { workflow: WorkflowNode }

const getNodeHeight = (definition: StateMachineDefinition, stateName: string): number => {
  const state = definition.States[stateName]
  return state.Type === 'Choice' ? 86 + state.Choices.length * 20 : 72
}

async function layoutNodes (definition: StateMachineDefinition): Promise<WorkflowCanvasNode[]> {
  const graph = projectWorkflowGraph(definition)
  const layout = await elk.layout({
    id: 'workflow',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '54',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
    },
    children: graph.nodes.map(node => ({
      id: node.id,
      width: 220,
      height: getNodeHeight(definition, node.id)
    })),
    edges: graph.edges.map(edge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  })
  const positions = new Map((layout.children ?? []).map(node => [node.id, {
    x: node.x ?? 0,
    y: node.y ?? 0
  }]))
  return graph.nodes.map(node => ({
    id: node.id,
    type: 'workflow',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      name: node.id,
      state: node.state,
      isStart: node.isStart
    }
  }))
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  definition,
  selectedStateName,
  onSelectState,
  onConnect,
  readOnly = false
}) => {
  const graph = useMemo(() => projectWorkflowGraph(definition), [definition])
  const projectedNodes = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes])
  const topologyKey = useMemo(() => JSON.stringify({
    nodes: graph.nodes.map(node => node.id),
    edges: graph.edges.map(edge => [edge.source, edge.sourceHandle, edge.target])
  }), [graph])
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>([])
  const lastLayoutTopology = useRef<string | null>(null)
  const initialEdges = useMemo<Edge[]>(() => graph.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    type: 'smoothstep',
    label: edge.kind === 'choice'
      ? `Rule ${(edge.choiceIndex ?? 0) + 1}`
      : edge.kind === 'default' ? 'Default' : undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: edge.source === selectedStateName
  })), [graph.edges, selectedStateName])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    if (lastLayoutTopology.current === topologyKey) return
    lastLayoutTopology.current = topologyKey
    let cancelled = false
    void layoutNodes(definition).then(layout => {
      if (!cancelled) setNodes(layout)
    })
    return () => { cancelled = true }
  }, [definition, setNodes, topologyKey])

  useEffect(() => {
    setNodes(current => current.map(node => {
      const projected = projectedNodes.get(node.id)
      return projected === undefined
        ? node
        : {
            ...node,
            selected: projected.id === selectedStateName,
            data: { name: projected.id, state: projected.state, isStart: projected.isStart }
          }
    }))
    setEdges(initialEdges)
  }, [initialEdges, projectedNodes, selectedStateName, setEdges, setNodes])

  const handleConnect = (connection: Connection): void => {
    if (readOnly) return
    onConnect(connection.source, connection.target, connection.sourceHandle ?? 'next')
  }

  return (
    <div className='h-full min-h-[560px] overflow-hidden rounded-lg border bg-muted/20'>
      <ReactFlow<WorkflowCanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => { onSelectState(node.id) }}
        onPaneClick={() => { onSelectState(null) }}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        edgesReconnectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.8}
      >
        <Background gap={20} size={1} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  )
}
