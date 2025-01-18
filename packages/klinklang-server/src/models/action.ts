import type { Action } from '@mudkipme/klinklang-prisma'
import { JSONPath } from 'jsonpath-plus'
import { mapValues } from 'lodash-es'
import type { ActionJobData, Actions } from '../actions/interfaces.ts'
import { render } from '../lib/template.ts'

type InputBuildType<T> =
  | {
    mode: 'rawValue'
    value: T
  }
  | {
    mode: 'jsonPath'
    jsonPath: string
  }
  | (T extends string ? {
      mode: 'template'
      template: string
    }
    : never)
  | (T extends unknown[] ? {
      mode: 'jsonPathArray'
      jsonPath: string
    }
    : never)

type InputBuilder<T> = T extends unknown[] ? Array<InputBuilder<T[number]>>
  : (T extends object ? { [P in keyof T]: InputBuilder<T[P]> } : InputBuildType<T>)

function buildInput<T> (builder: InputBuilder<T>, context: Record<string, unknown>): T {
  const directBuilder = builder as InputBuildType<T>
  if (directBuilder.mode === 'rawValue') {
    return directBuilder.value
  } else if (directBuilder.mode === 'jsonPath') {
    return JSONPath<T[]>({ json: context, path: directBuilder.jsonPath })[0]
  } else if (directBuilder.mode === 'jsonPathArray') {
    return JSONPath<T>({ json: context, path: directBuilder.jsonPath })
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- template
  } else if (directBuilder.mode === 'template') {
    return render(directBuilder.template, context) as T
  }

  if (Array.isArray(builder)) {
    return builder.map(value => buildInput(value, context)) as T
  }

  const nestedBuilder = builder as { [P in keyof T]: InputBuilder<T[P]> | InputBuildType<T[P]> }
  return mapValues(nestedBuilder, (value: InputBuilder<unknown>) => buildInput(value, context)) as T
}

export function buildJobData<T extends Actions> (
  action: Action,
  instanceId: string,
  context: Record<string, unknown>
): ActionJobData<T> {
  return {
    actionId: action.id,
    actionType: action.actionType as T['actionType'],
    workflowId: action.workflowId,
    instanceId,
    input: buildInput(action.inputBuilder as InputBuilder<T['input']>, context)
  }
}
