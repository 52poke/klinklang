import { Container, Link, Typography } from '@mui/material'
import React from 'react'

export const KlinklangFooter: React.FC = () => (
  <Container sx={{ padding: 2 }}>
    <Typography variant='body2'>
      &copy; <Link href='https://52poke.wiki' color='inherit'>52Poké Wiki</Link>
    </Typography>
  </Container>
)
