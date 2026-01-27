import { z } from 'zod'

const choiceRuleInnerSchema: z.ZodType = z.lazy(() => z.union([
  z.object({
    Variable: z.string().min(1),
    StringEquals: z.string()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    StringMatches: z.string()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericEquals: z.number()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericEqualsPath: z.string().min(1)
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericLessThan: z.number()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericLessThanPath: z.string().min(1)
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericGreaterThan: z.number()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericGreaterThanPath: z.string().min(1)
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericLessThanEquals: z.number()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericLessThanEqualsPath: z.string().min(1)
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericGreaterThanEquals: z.number()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    NumericGreaterThanEqualsPath: z.string().min(1)
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    BooleanEquals: z.boolean()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    IsPresent: z.boolean()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    IsNull: z.boolean()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    IsString: z.boolean()
  }).strict(),
  z.object({
    Variable: z.string().min(1),
    IsNumeric: z.boolean()
  }).strict(),
  z.object({
    And: z.array(choiceRuleInnerSchema).min(1)
  }).strict(),
  z.object({
    Or: z.array(choiceRuleInnerSchema).min(1)
  }).strict(),
  z.object({
    Not: choiceRuleInnerSchema
  }).strict()
]))

export const choiceRuleSchema = z.union([
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    StringEquals: z.string()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    StringMatches: z.string()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericEquals: z.number()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericEqualsPath: z.string().min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericLessThan: z.number()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericLessThanPath: z.string().min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericGreaterThan: z.number()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericGreaterThanPath: z.string().min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericLessThanEquals: z.number()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericLessThanEqualsPath: z.string().min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericGreaterThanEquals: z.number()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    NumericGreaterThanEqualsPath: z.string().min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    BooleanEquals: z.boolean()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    IsPresent: z.boolean()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    IsNull: z.boolean()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    IsString: z.boolean()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Variable: z.string().min(1),
    IsNumeric: z.boolean()
  }).strict(),
  z.object({
    Next: z.string().min(1),
    And: z.array(choiceRuleInnerSchema).min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Or: z.array(choiceRuleInnerSchema).min(1)
  }).strict(),
  z.object({
    Next: z.string().min(1),
    Not: choiceRuleInnerSchema
  }).strict()
])
