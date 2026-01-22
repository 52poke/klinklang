import Handlebars from 'handlebars'

Handlebars.registerHelper('encodeURIComponent', encodeURIComponent)
Handlebars.registerHelper('decodeURIComponent', decodeURIComponent)
Handlebars.registerHelper('encodeURI', encodeURI)
Handlebars.registerHelper('decodeURI', decodeURI)
Handlebars.registerHelper('stripHTML', (text: string | undefined) => text?.replace(/<[^>]*>?/gv, ''))

export function render (template: string, context: Record<string, unknown>): string {
  const render = Handlebars.compile(template)
  return render(context)
}
