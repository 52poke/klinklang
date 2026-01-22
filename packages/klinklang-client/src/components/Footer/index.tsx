import React from 'react'

export const KlinklangFooter: React.FC = () => (
  <footer className='border-t'>
    <div className='mx-auto flex max-w-6xl items-center px-4 py-6 text-sm text-muted-foreground'>
      &copy;{' '}
      <a
        href='https://52poke.wiki'
        className='ml-1 text-foreground underline-offset-4 hover:underline'
        rel='noreferrer'
        target='_blank'
      >
        52Poké Wiki
      </a>
    </div>
  </footer>
)
