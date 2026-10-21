import { match } from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SchemaDrivenForm } from '../src/pages/Workflows/editor/SchemaDrivenForm.tsx'

void test('renders an existing template in an editable template field', () => {
  const markup = renderToStaticMarkup(createElement(SchemaDrivenForm, {
    schema: { type: 'object', properties: { url: { type: 'string', format: 'uri', title: 'URL' } } },
    value: { url: { Template: 'http://inazuma/wiki/{{encodeURI payload.page_title}}' } },
    onChange: () => { throw new Error('Static rendering must not change values') }
  }))
  match(markup, /<textarea[^>]*aria-label="URL template"/v)
  match(markup, /http:\/\/inazuma\/wiki\/\{\{encodeURI payload.page_title\}\}/v)
})
