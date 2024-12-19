import { Delete } from '@mui/icons-material'
import {
  Button,
  Card,
  CardContent,
  Container,
  Grid2,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import React, { useCallback, useRef } from 'react'
import { useUserStore } from '../../store/user'

export const Settings: React.FC = () => {
  const domainEl = useRef<HTMLInputElement | null>(null)
  const { currentUser, fetchCurrentUser } = useUserStore()

  const fediConnect = useCallback(async () => {
    if (domainEl.current === null || domainEl.current.value === '') {
      return
    }
    const response = await fetch('/fedi/login', {
      method: 'POST',
      body: JSON.stringify({ domain: domainEl.current.value }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    if (response.status !== 200) {
      console.log(await response.text())
      return
    }
    const { redirectURL } = await response.json() as { redirectURL: string }
    location.href = redirectURL
  }, [])

  const deleteFediAccount = useCallback(async (id: string) => {
    const response = await fetch(`/api/fedi-account/${id}`, {
      method: 'DELETE'
    })
    if (response.status >= 300 || response.status < 200) {
      console.log(await response.text())
      return
    }
    await fetchCurrentUser()
  }, [fetchCurrentUser])

  return (
    <Container sx={{ my: 2 }}>
      <Grid2 container spacing={2}>
        {(currentUser?.fediAccounts.length ?? 0) > 0 && (
          <Grid2 size={{ xs: 12, sm: 2 }}>
            <Card>
              <CardContent>
                <Typography variant='h5'>Linked ActivityPub accounts</Typography>
                <List>
                  {currentUser?.fediAccounts.map((account) => (
                    <ListItem
                      key={account.subject}
                      disablePadding
                      secondaryAction={
                        <IconButton
                          edge='end'
                          onClick={() => {
                            deleteFediAccount(account.id).catch(console.log)
                          }}
                        >
                          <Delete />
                        </IconButton>
                      }
                    >
                      <ListItemText>{account.subject}</ListItemText>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid2>
        )}
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <Card>
            <CardContent>
              <Typography variant='h5' mb={2}>Link to a new ActivityPub account</Typography>
              <Stack direction='row' spacing={2}>
                <TextField inputRef={domainEl} label='Your instance domain' size='small' />
                <Button
                  variant='contained'
                  onClick={() => {
                    fediConnect().catch(console.log)
                  }}
                >
                  Connect
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid2>
      </Grid2>
    </Container>
  )
}
