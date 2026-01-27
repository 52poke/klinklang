import React, { useMemo } from 'react'
import { NavLink } from 'react-router'
import { cn } from '../../lib/utils'
import { useUserStore } from '../../store/user'

const menus = [
  {
    title: 'Term Replacer',
    link: '/pages/replace'
  },
  {
    title: 'Translate',
    link: '/pages/translate',
    requiresTranslate: true
  },
  {
    title: 'Workflows',
    link: '/pages/workflows'
  }
]

export interface KlinklangMenuProps {
  onNavigate?: () => void
}

export const KlinklangMenu: React.FC<KlinklangMenuProps> = ({ onNavigate }) => {
  const { currentUser } = useUserStore()
  const canTranslate = useMemo(() => {
    const groups = currentUser?.groups ?? []
    return groups.includes('sysop') || groups.includes('bot')
  }, [currentUser])

  return (
    <nav className='flex flex-col gap-1'>
      {menus.filter(menu => !(menu.requiresTranslate ?? false) || canTranslate).map((menu) => (
        <NavLink
          key={menu.title}
          to={menu.link}
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
              isActive && 'bg-muted text-foreground'
            )}
        >
          {menu.title}
        </NavLink>
      ))}
    </nav>
  )
}
