import AccountCircle from '@mui/icons-material/AccountCircle'
import Face from '@mui/icons-material/Face'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import {
  AppBar,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography
} from '@mui/material'
import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUserStore } from '../../store/user'

export interface KlinklangHeaderProps {
  onDrawerOpen: () => void
}

export const KlinklangHeader: React.FC<KlinklangHeaderProps> = ({ onDrawerOpen }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const { currentUser, logout } = useUserStore()
  const navigate = useNavigate()

  const login = useCallback(() => {
    window.location.href = '/oauth/login'
  }, [])

  return (
    <AppBar>
      <Toolbar>
        <IconButton
          color='inherit'
          edge='start'
          sx={{ mr: 2 }}
          onClick={onDrawerOpen}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant='h6' component='div' sx={{ flexGrow: 1 }}>
          52Poké Wiki Utilities
        </Typography>
        <div>
          <IconButton
            color='inherit'
            size='large'
            onClick={(e) => {
              setAnchorEl(e.currentTarget)
            }}
          >
            <AccountCircle />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right'
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right'
            }}
            open={anchorEl !== null}
            onClose={() => {
              setAnchorEl(null)
            }}
          >
            {currentUser !== null
              ? [
                <MenuItem
                  onClick={() => {
                    void navigate('/pages/settings')
                    setAnchorEl(null)
                  }}
                  key='settings'
                >
                  <ListItemIcon>
                    <Face />
                  </ListItemIcon>
                  <ListItemText>{currentUser.name}</ListItemText>
                </MenuItem>,
                <Divider key='divider' />,
                <MenuItem
                  onClick={() => {
                    logout().catch(console.log)
                  }}
                  key='logout'
                >
                  <ListItemIcon>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText>Logout</ListItemText>
                </MenuItem>
              ]
              : (
                <MenuItem onClick={login}>
                  <ListItemIcon>
                    <LoginIcon />
                  </ListItemIcon>
                  <ListItemText>Login</ListItemText>
                </MenuItem>
              )}
          </Menu>
        </div>
      </Toolbar>
    </AppBar>
  )
}
