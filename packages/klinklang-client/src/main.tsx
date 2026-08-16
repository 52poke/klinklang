import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { App } from './App'
import { Settings } from './pages/Settings'
import { TermReplacer } from './pages/TermReplacer'
import { Translate } from './pages/Translate'
import { Workflows } from './pages/Workflows'
import { WorkflowDetail } from './pages/Workflows/Detail'
import { WorkflowInstances } from './pages/Workflows/Instances'
import './globals.css'
import '@xyflow/react/dist/style.css'

const WorkflowEditor = React.lazy(async () => {
  const module = await import('./pages/Workflows/Editor')
  return { default: module.WorkflowEditor }
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/pages/replace',
        element: <TermReplacer />
      },
      {
        path: '/pages/workflows',
        element: <Workflows />
      },
      {
        path: '/pages/translate',
        element: <Translate />
      },
      {
        path: '/pages/workflows/:workflowId',
        element: <WorkflowDetail />
      },
      {
        path: '/pages/workflows/:workflowId/instances',
        element: <WorkflowInstances />
      },
      {
        path: '/pages/workflows/:workflowId/edit',
        element: <React.Suspense fallback={<div className='text-sm text-muted-foreground'>Loading editor…</div>}><WorkflowEditor /></React.Suspense>
      },
      {
        path: '/pages/settings',
        element: <Settings />
      },
      {
        index: true,
        element: <TermReplacer />
      }
    ]
  }
])

// oxlint-disable-next-line typescript/no-non-null-assertion -- root element is always present
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
