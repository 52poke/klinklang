import React from 'react'
import { NavLink } from 'react-router'
import { cn } from '../../lib/utils'

const menus = [
  {
    title: 'Term Replacer',
    link: '/pages/replace'
  },
  {
    title: 'Workflows',
    link: '/pages/workflows'
  }
]

export const KlinklangMenu: React.FC = () => {
  return (
    <nav className='flex flex-col gap-1'>
      {menus.map((menu) => (
        <NavLink
          key={menu.title}
          to={menu.link}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
              isActive && 'bg-muted text-foreground'
            )
          }
        >
          {menu.title}
        </NavLink>
      ))}
    </nav>
  )
}
