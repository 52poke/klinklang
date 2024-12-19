import { List, ListItem, ListItemButton, ListItemText } from '@mui/material'
import React from 'react'
import { useLocation } from 'react-router'

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
  const location = useLocation()

  return (
    <List>
      {menus.map((menu) => (
        <ListItem key={menu.title} disablePadding>
          <ListItemButton href={menu.link} selected={location.pathname === menu.link}>
            <ListItemText primary={menu.title} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  )
}
