import { deepEqual, equal, match, ok } from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { StateMachineDefinition } from '@mudkipme/klinklang-domain'
import { draftReducer, parseDefinition, validateDefinition, type DraftHistory } from '../src/pages/Workflows/editor/draft.ts'

const initial: StateMachineDefinition = { StartAt: 'Start', States: { Start: { Type: 'Pass', End: true } } }
const edited: StateMachineDefinition = { StartAt: 'Start', States: { Start: { Type: 'Pass', Next: 'Done' }, Done: { Type: 'Succeed' } } }
const history = (): DraftHistory => ({ past: [], present: initial, future: [] })

void describe('workflow draft recovery', () => {
  void test('undo and redo preserve transitions and start state without mutating snapshots', () => {
    const changed = draftReducer(history(), { type: 'edit', definition: edited })
    const undone = draftReducer(changed, { type: 'undo' })
    deepEqual(undone.present, initial)
    deepEqual(draftReducer(undone, { type: 'redo' }).present, edited)
    deepEqual(initial.States.Start, { Type: 'Pass', End: true })
  })
  void test('editing after undo clears redo, while no-op edits retain history', () => {
    const changed = draftReducer(history(), { type: 'edit', definition: edited })
    equal(draftReducer(changed, { type: 'edit', definition: structuredClone(edited) }), changed)
    const undone = draftReducer(changed, { type: 'undo' })
    equal(draftReducer(undone, { type: 'edit', definition: { ...initial, StartAt: 'Other' } }).future.length, 0)
  })
  void test('reset discards history and empty undo/redo are safe', () => {
    const empty = history()
    equal(draftReducer(empty, { type: 'undo' }), empty)
    equal(draftReducer(empty, { type: 'redo' }), empty)
    deepEqual(draftReducer(draftReducer(empty, { type: 'edit', definition: edited }), { type: 'reset', definition: initial }), empty)
  })
  void test('valid JSON repairs are validated independently of the invalid visual draft', () => {
    const invalid: StateMachineDefinition = { StartAt: 'Start', States: { Start: { Type: 'Pass', Next: 'Missing' } } }
    equal(validateDefinition(invalid, []).length > 0, true)
    const repaired = parseDefinition(JSON.stringify(edited))
    deepEqual(repaired.issues, [])
    ok(repaired.definition !== null)
    deepEqual(validateDefinition(repaired.definition, []), [])
  })
  void test('malformed JSON and invalid Choice shapes cannot be saved', () => {
    equal(parseDefinition('{').definition, null)
    const invalid: StateMachineDefinition = { StartAt: 'Branch', States: { Branch: { Type: 'Choice', Choices: [] } } }
    match(validateDefinition(invalid, []).join('\n'), /Choices/v)
    equal(parseDefinition(JSON.stringify(invalid)).definition, null)
  })
})
