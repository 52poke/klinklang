import { LogIn, LogOut, Menu, User, UserCircle } from 'lucide-react'
import React, { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useUserStore } from '../../store/user'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

export interface KlinklangHeaderProps {
  onDrawerOpen: () => void
}

export const KlinklangHeader: React.FC<KlinklangHeaderProps> = ({ onDrawerOpen }) => {
  const { currentUser, logout } = useUserStore()
  const navigate = useNavigate()

  const login = useCallback(() => {
    window.location.href = '/oauth/login'
  }, [])

  return (
    <header className='fixed inset-x-0 top-0 z-40 border-b bg-background/95 shadow-sm backdrop-blur'>
      <div className='mx-auto flex h-14 max-w-6xl items-center gap-3 px-4'>
        <Button
          variant='ghost'
          size='icon'
          onClick={onDrawerOpen}
          aria-label='Open navigation'
          className='rounded-full'
        >
          <Menu className='h-5 w-5' />
        </Button>
        <div className='text-base font-semibold'>52Poké Wiki Utilities</div>
        <div className='ml-auto'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Account menu' className='rounded-full'>
                <User className='h-5 w-5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48'>
              {currentUser === null
                ? (
                  <DropdownMenuItem onClick={login}>
                    <LogIn className='mr-2 h-4 w-4' />
                    Login
                  </DropdownMenuItem>
                )
                : (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        void navigate('/pages/settings')
                      }}
                    >
                      <UserCircle className='mr-2 h-4 w-4' />
                      {currentUser.name}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        logout().catch(() => undefined)
                      }}
                    >
                      <LogOut className='mr-2 h-4 w-4' />
                      Logout
                    </DropdownMenuItem>
                  </>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
