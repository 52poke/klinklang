export async function readJson (response: Response): Promise<unknown> {
  return await response.json() as unknown
}
