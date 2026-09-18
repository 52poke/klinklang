import React, { useEffect, useState } from 'react'
import { Outlet, useMatch } from 'react-router'
import { KlinklangFooter } from './components/Footer'
import { KlinklangHeader } from './components/Header'
import { KlinklangMenu } from './components/Menu'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './components/ui/sheet'
import { useUserStore } from './store/user'

export const App: React.FC = () => {
  const isEditor = useMatch('/pages/workflows/:workflowId/edit') !== null
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { fetchCurrentUser } = useUserStore()
  useEffect(() => {
    fetchCurrentUser().catch(() => undefined)
  }, [fetchCurrentUser])

  return (
    <div className='min-h-screen bg-slate-50/60 text-foreground'>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side='left' className='w-72 p-0'>
          <div className='border-b px-6 py-4'>
            <SheetTitle className='text-lg font-semibold'>Klinklang</SheetTitle>
            <SheetDescription>Utilities for 52Poké Wiki</SheetDescription>
          </div>
          <div className='px-2 py-3'>
            <KlinklangMenu
              onNavigate={() => {
                setDrawerOpen(false)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
      <KlinklangHeader
        onDrawerOpen={() => {
          setDrawerOpen(true)
        }}
      />
      <main id='main-content' className={isEditor ? 'flex h-dvh min-h-0 w-full flex-col px-3 pb-3 pt-[68px] sm:px-4' : 'mx-auto min-h-[calc(100dvh-73px)] w-full max-w-6xl px-4 pb-12 pt-24'}>
        <Outlet />
      </main>
      {!isEditor && <KlinklangFooter />}
    </div>
  )
}
