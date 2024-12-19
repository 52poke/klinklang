import { CssBaseline, ThemeProvider } from '@mui/material'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { App } from './App'
import { Settings } from './pages/Settings'
import { TermReplacer } from './pages/TermReplacer'
import { Workflows } from './pages/Workflows'
import theme from './theme'

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

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- root element is always present
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
)
