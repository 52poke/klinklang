import { Box, Drawer, Toolbar, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { KlinklangHeader } from './components/Header'
import { Outlet } from 'react-router-dom'
import { KlinklangMenu } from './components/Menu'
import { KlinklangFooter } from './components/Footer'
import { useUserStore } from './store/user'

export const App: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { fetchCurrentUser } = useUserStore()
  useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  return (
    <Box>
      <Drawer open={drawerOpen} onClose={() => { setDrawerOpen(false) }} onClick={() => { setDrawerOpen(false) }}>
        <Box padding={2} width={256}>
          <Typography variant='h6'>Klinklang</Typography>
          <Typography variant="subtitle2" color="text.secondary">Utilities for 52Poké Wiki</Typography>
        </Box>
        <KlinklangMenu />
      </Drawer>
      <KlinklangHeader onDrawerOpen={() => { setDrawerOpen(true) }} />
      <Toolbar />
      <Outlet />
      <KlinklangFooter />
    </Box>
  )
}
