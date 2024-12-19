import { createTheme } from '@mui/material/styles'
import React from 'react'
import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router'

const LinkBehavior = React.forwardRef<
  HTMLAnchorElement,
  Omit<RouterLinkProps, 'to'> & { href: RouterLinkProps['to'] }
>((props, ref) => {
  const { href, ...other } = props
  return <RouterLink ref={ref} to={href} {...other} />
})

const theme = createTheme({
  components: {
    MuiLink: {
      defaultProps: {
        component: LinkBehavior
      }
    },
    MuiListItemButton: {
      defaultProps: {
        LinkComponent: LinkBehavior
      }
    }
  }
})

export default theme
