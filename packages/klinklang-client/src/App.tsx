import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { KlinklangFooter } from './components/Footer'
import { KlinklangHeader } from './components/Header'
import { KlinklangMenu } from './components/Menu'
import { Sheet, SheetContent } from './components/ui/sheet'
import { useUserStore } from './store/user'

export const App: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { fetchCurrentUser } = useUserStore()
  useEffect(() => {
    fetchCurrentUser().catch(() => undefined)
  }, [fetchCurrentUser])

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side='left' className='w-72 p-0'>
          <div className='border-b px-6 py-4'>
            <div className='text-lg font-semibold'>Klinklang</div>
            <div className='text-sm text-muted-foreground'>Utilities for 52Poké Wiki</div>
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
      <main className='mx-auto w-full max-w-6xl px-4 pb-12 pt-16'>
        <Outlet />
      </main>
      <KlinklangFooter />
    </div>
  )
}
